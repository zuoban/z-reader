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
	maxTTSTextRunes    = 2000
	maxSSMLBytes       = 32 * 1024
	maxSSMLRequestBody = 64 * 1024
)

func NewTTSHandler() *TTSHandler {
	return &TTSHandler{}
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

	contentType, ext := ttsAudioFormatInfo(outputFormat)

	c.Header("Content-Type", contentType)

	if download == "true" {
		filename := uuid.New().String() + ext
		c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	}

	c.Data(http.StatusOK, contentType, audioData)
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
	if err := c.ShouldBindJSON(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		response.BadRequest(c, "请求体必须是有效 JSON")
		return
	}

	if req.Ssml == "" {
		response.BadRequest(c, "参数 'ssml' 不能为空")
		return
	}
	if len(req.Ssml) > maxSSMLBytes {
		response.BadRequest(c, "SSML 内容过长")
		return
	}

	// Sanitize SSML to prevent injection of unsafe tags.
	// Only known-safe SSML tags are preserved; everything else is escaped.
	sanitizedSsml := utils.EscapeSSML(req.Ssml)

	outputFormat := req.OutputFormat
	if outputFormat == "" {
		outputFormat = "audio-24khz-48kbitrate-mono-mp3"
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

	contentType, ext := ttsAudioFormatInfo(outputFormat)

	c.Header("Content-Type", contentType)

	if req.Download {
		filename := uuid.New().String() + ext
		c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
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

	c.JSON(http.StatusOK, voices)
}
