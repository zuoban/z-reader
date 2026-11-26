package handlers

import (
	"context"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/response"
	"z-reader/backend/services"
	"z-reader/backend/utils"
)

type TTSHandler struct {
	listVoices        func(context.Context) ([]services.Voice, error)
	generateTextAudio func(context.Context, string, string, string, string, string, string) ([]byte, error)
	generateSSMLAudio func(context.Context, string, string, bool) ([]byte, error)
}

const (
	maxTTSTextRunes       = 2000
	maxSSMLBytes          = 32 * 1024
	maxSanitizedSSMLBytes = maxSSMLBytes * 2
	maxSSMLRequestBody    = 64 * 1024
	maxTTSVoiceLen        = 128
	maxTTSProsodyLen      = 32
	maxTTSStyleLen        = 64
	maxTTSOutputFormatLen = 64
)

func NewTTSHandler() *TTSHandler {
	return &TTSHandler{}
}

// Close drains any in-flight background TTS disk cache writes bounded by ctx.
func (h *TTSHandler) Close(ctx context.Context) error {
	return services.WaitTTSDiskWrites(ctx)
}

func (h *TTSHandler) TTS(c *gin.Context) {
	text := c.Query("t")
	if text == "" {
		response.BadRequest(c, "参数 't' 不能为空")
		return
	}
	if utf8.RuneCountInString(text) > maxTTSTextRunes {
		response.BadRequest(c, "朗读文本过长")
		return
	}

	voiceName := c.DefaultQuery("v", "zh-CN-XiaoxiaoMultilingualNeural")
	rate := c.DefaultQuery("r", "0")
	pitch := c.DefaultQuery("p", "0")
	style := c.DefaultQuery("s", "general")
	outputFormat := c.DefaultQuery("o", "audio-24khz-48kbitrate-mono-mp3")
	download := c.DefaultQuery("d", "false")

	if !isValidTTSVoice(voiceName) {
		response.BadRequest(c, "参数 'v' 无效")
		return
	}
	if !isValidTTSProsody(rate) {
		response.BadRequest(c, "参数 'r' 无效")
		return
	}
	if !isValidTTSProsody(pitch) {
		response.BadRequest(c, "参数 'p' 无效")
		return
	}
	if !isValidTTSStyle(style) {
		response.BadRequest(c, "参数 's' 无效")
		return
	}
	if !isValidTTSOutputFormat(outputFormat) {
		response.BadRequest(c, "参数 'o' 无效")
		return
	}

	generateText := h.generateTextAudio
	if generateText == nil {
		generateText = services.GenerateAudioFromTextContext
	}
	audioData, err := generateText(
		c.Request.Context(), text, voiceName, rate, pitch, style, outputFormat,
	)
	if err != nil {
		if c.Request.Context().Err() != nil {
			return
		}
		respondTTSError(c, err)
		return
	}

	writeTTSAudioResponse(c, outputFormat, download == "true", audioData)
}

type SSMLRequest struct {
	Ssml         string `json:"ssml" binding:"required"`
	OutputFormat string `json:"output_format"`
	RefreshAudio bool   `json:"refresh_audio"`
	Download     bool   `json:"download"`
}

func (h *TTSHandler) SSML(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSSMLRequestBody)

	var req SSMLRequest
	if !bindJSON(c, &req, "请求体必须是有效 JSON") {
		return
	}

	if len(req.Ssml) > maxSSMLBytes {
		response.BadRequest(c, "SSML 内容过长")
		return
	}

	outputFormat := req.OutputFormat
	if outputFormat == "" {
		outputFormat = "audio-24khz-48kbitrate-mono-mp3"
	}
	if !isValidTTSOutputFormat(outputFormat) {
		response.BadRequest(c, "参数 'output_format' 无效")
		return
	}

	// Sanitize SSML to prevent injection of unsafe tags.
	// Only known-safe SSML tags are preserved; everything else is escaped.
	sanitizedSsml := utils.EscapeSSML(req.Ssml)
	if len(sanitizedSsml) > maxSanitizedSSMLBytes {
		response.BadRequest(c, "SSML 内容过长")
		return
	}

	var (
		audioData []byte
		err       error
	)
	if h.generateSSMLAudio != nil {
		audioData, err = h.generateSSMLAudio(c.Request.Context(), sanitizedSsml, outputFormat, req.RefreshAudio)
	} else if req.RefreshAudio {
		audioData, err = services.RefreshAudioFromSsmlContext(c.Request.Context(), sanitizedSsml, outputFormat)
	} else {
		audioData, err = services.GenerateAudioFromSsmlContext(c.Request.Context(), sanitizedSsml, outputFormat)
	}
	if err != nil {
		if c.Request.Context().Err() != nil {
			return
		}
		respondTTSError(c, err)
		return
	}

	writeTTSAudioResponse(c, outputFormat, req.Download, audioData)
}

func writeTTSAudioResponse(c *gin.Context, outputFormat string, download bool, audioData []byte) {
	contentType, ext := ttsAudioFormatInfo(outputFormat)
	c.Header("Content-Type", contentType)
	if download {
		c.Header("Content-Disposition", "attachment; filename=\""+uuid.New().String()+ext+"\"")
	}
	c.Data(http.StatusOK, contentType, audioData)
}

func ttsAudioFormatInfo(outputFormat string) (contentType, ext string) {
	lower := strings.ToLower(outputFormat)
	switch {
	case strings.Contains(lower, "webm"):
		return "audio/webm", ".webm"
	case strings.Contains(lower, "ogg"):
		return "audio/ogg", ".ogg"
	case strings.Contains(lower, "opus"):
		return "audio/opus", ".opus"
	case strings.Contains(lower, "raw") && strings.Contains(lower, "pcm"):
		return "audio/pcm", ".pcm"
	case strings.Contains(lower, "wav") || strings.Contains(lower, "riff") || strings.Contains(lower, "pcm"):
		return "audio/wav", ".wav"
	default:
		return "audio/mpeg", ".mp3"
	}
}

func respondTTSError(c *gin.Context, err error) {
	failure := services.TTSHTTPError(err)
	if failure.RetryAfter != "" {
		c.Header("Retry-After", failure.RetryAfter)
	}
	c.JSON(failure.StatusCode, gin.H{"error": failure.Error(), "code": failure.Kind})
}

func (h *TTSHandler) VoiceList(c *gin.Context) {
	filter := strings.ToLower(c.Query("l"))

	listVoices := h.listVoices
	if listVoices == nil {
		listVoices = services.GetVoiceListContext
	}
	voices, err := listVoices(c.Request.Context())
	if err != nil {
		if c.Request.Context().Err() != nil {
			return
		}
		respondTTSError(c, err)
		return
	}

	if filter != "" {
		filtered := make([]services.Voice, 0)
		for _, voice := range voices {
			if strings.Contains(strings.ToLower(voice.Locale), filter) {
				filtered = append(filtered, voice)
			}
		}
		voices = filtered
	}

	c.Header("Cache-Control", "private, max-age=300")
	c.JSON(http.StatusOK, voices)
}

func isASCIIToken(value string, maxLen int, allow func(byte) bool) bool {
	if len(value) == 0 || len(value) > maxLen {
		return false
	}
	for i := 0; i < len(value); i++ {
		if !allow(value[i]) {
			return false
		}
	}
	return true
}

func isASCIIAlphaNum(b byte) bool {
	return (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9')
}

func isValidTTSVoice(value string) bool {
	return isASCIIToken(value, maxTTSVoiceLen, func(b byte) bool {
		return isASCIIAlphaNum(b) || b == '.' || b == '_' || b == ':' || b == '-'
	})
}

func isValidTTSProsody(value string) bool {
	return isASCIIToken(value, maxTTSProsodyLen, func(b byte) bool {
		return isASCIIAlphaNum(b) || b == '.' || b == '+' || b == '-' || b == '_' || b == '%'
	})
}

func isValidTTSStyle(value string) bool {
	return isASCIIToken(value, maxTTSStyleLen, func(b byte) bool {
		return isASCIIAlphaNum(b) || b == '.' || b == '_' || b == '-'
	})
}

func isValidTTSOutputFormat(value string) bool {
	return isASCIIToken(value, maxTTSOutputFormatLen, func(b byte) bool {
		return isASCIIAlphaNum(b) || b == '-'
	})
}
