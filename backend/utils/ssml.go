package utils

import (
	"regexp"
	"strconv"
	"strings"
)

type TagPattern struct {
	Name    string
	Pattern string
	regex   *regexp.Regexp
}

var PreserveTags = []TagPattern{
	{Name: "break", Pattern: `<break\s+[^>]*\/>`},
	{Name: "bookmark", Pattern: `<bookmark\s+[^>]*\/>`},
	{Name: "speak", Pattern: `<speak\b[^>]*>|<\/speak>`},
	{Name: "prosody", Pattern: `<prosody\s+[^>]*>|<\/prosody>`},
	{Name: "emphasis", Pattern: `<emphasis\s+[^>]*>|<\/emphasis>`},
	{Name: "voice", Pattern: `<voice\s+[^>]*>|<\/voice>`},
	{Name: "say-as", Pattern: `<say-as\s+[^>]*>|<\/say-as>`},
	{Name: "phoneme", Pattern: `<phoneme\s+[^>]*>|<\/phoneme>`},
	{Name: "audio", Pattern: `<audio\s+[^>]*>|<\/audio>`},
	{Name: "p", Pattern: `<p\b[^>]*>|<\/p>`},
	{Name: "s", Pattern: `<s\b[^>]*>|<\/s>`},
	{Name: "sub", Pattern: `<sub\s+[^>]*>|<\/sub>`},
	{Name: "mstts", Pattern: `<mstts:[^>]*>|<\/mstts:[^>]*>`},
}

func init() {
	for i := range PreserveTags {
		PreserveTags[i].regex = regexp.MustCompile(PreserveTags[i].Pattern)
	}
}

func EscapeSSML(ssml string) string {
	placeholders := make(map[string]string)
	processedSSML := ssml
	counter := 0

	for _, tag := range PreserveTags {
		re := tag.regex
		processedSSML = re.ReplaceAllStringFunc(processedSSML, func(match string) string {
			placeholder := "__SSML_PLACEHOLDER_" + tag.Name + "_" + strconv.Itoa(counter) + "__"
			counter++
			placeholders[placeholder] = match
			return placeholder
		})
	}

	escapedContent := EscapeBasicXml(processedSSML)

	for placeholder, tag := range placeholders {
		escapedContent = strings.Replace(escapedContent, placeholder, tag, -1)
	}

	return escapedContent
}

func EscapeBasicXml(unsafe string) string {
	replacer := strings.NewReplacer(
		"<", "&lt;",
		">", "&gt;",
		"&", "&amp;",
		"'", "&apos;",
		"\"", "&quot;",
	)
	return replacer.Replace(unsafe)
}

func BuildSsml(text, voiceName, rate, pitch, style string) string {
	escapedText := EscapeSSML(text)
	return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="` + voiceName + `"><mstts:express-as style="` + style + `" styledegree="1.0" role="default"><prosody rate="` + rate + `%" pitch="` + pitch + `%" volume="50">` + escapedText + `</prosody></mstts:express-as></voice></speak>`
}
