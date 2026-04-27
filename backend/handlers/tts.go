package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"z-reader/backend/response"
	"z-reader/backend/services"
)

type TTSHandler struct{}

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

	audioData, err := services.GenerateAudioFromText(text, voiceName, rate, pitch, style, outputFormat)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	contentType := "audio/mpeg"
	if strings.Contains(outputFormat, "opus") {
		contentType = "audio/opus"
	} else if strings.Contains(outputFormat, "wav") || strings.Contains(outputFormat, "pcm") {
		contentType = "audio/wav"
	}

	c.Header("Content-Type", contentType)

	if download == "true" {
		filename := uuid.New().String() + ".mp3"
		c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	}

	c.Data(http.StatusOK, contentType, audioData)
}

type SSMLRequest struct {
	Ssml         string `json:"ssml" binding:"required"`
	OutputFormat string `json:"output_format"`
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

	outputFormat := req.OutputFormat
	if outputFormat == "" {
		outputFormat = "audio-24khz-48kbitrate-mono-mp3"
	}

	audioData, err := services.GenerateAudioFromSsml(req.Ssml, outputFormat)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	contentType := "audio/mpeg"
	if strings.Contains(outputFormat, "opus") {
		contentType = "audio/opus"
	} else if strings.Contains(outputFormat, "wav") || strings.Contains(outputFormat, "pcm") {
		contentType = "audio/wav"
	}

	c.Header("Content-Type", contentType)

	if req.Download {
		filename := uuid.New().String() + ".mp3"
		c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	}

	c.Data(http.StatusOK, contentType, audioData)
}

func (h *TTSHandler) VoiceList(c *gin.Context) {
	filter := strings.ToLower(c.Query("l"))

	voices, err := services.GetVoiceList()
	if err != nil {
		response.InternalError(c, err.Error())
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
