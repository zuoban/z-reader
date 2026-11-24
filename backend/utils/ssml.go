package utils

import (
	"regexp"
	"strings"
)

// Match complete tags with quoted attributes. Only speech markup that does
// not reference external resources is forwarded to the speech provider.
var ssmlTag = regexp.MustCompile(`</?([\w:-]+)(?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*/?>`)

func EscapeSSML(ssml string) string {
	var output strings.Builder
	previous := 0
	for _, tag := range ssmlTag.FindAllStringSubmatchIndex(ssml, -1) {
		output.WriteString(EscapeBasicXml(ssml[previous:tag[0]]))
		markup := ssml[tag[0]:tag[1]]
		switch ssml[tag[2]:tag[3]] {
		case "break", "bookmark", "speak", "lang", "prosody", "emphasis", "voice",
			"say-as", "phoneme", "p", "s", "sub", "mstts:express-as", "mstts:silence",
			"mstts:audioduration":
			output.WriteString(markup)
		default:
			output.WriteString(EscapeBasicXml(markup))
		}
		previous = tag[1]
	}
	output.WriteString(EscapeBasicXml(ssml[previous:]))
	return output.String()
}

var xmlEscaper = strings.NewReplacer(
	"<", "&lt;",
	">", "&gt;",
	"&", "&amp;",
	"'", "&apos;",
	"\"", "&quot;",
)

func EscapeBasicXml(text string) string {
	return xmlEscaper.Replace(text)
}

func BuildSsml(text, voiceName, rate, pitch, style string) string {
	return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">` +
		`<voice name="` + EscapeBasicXml(voiceName) + `"><mstts:express-as style="` + EscapeBasicXml(style) +
		`" styledegree="1.0" role="default"><prosody rate="` + EscapeBasicXml(rate) +
		`%" pitch="` + EscapeBasicXml(pitch) + `%" volume="50">` + EscapeBasicXml(text) +
		`</prosody></mstts:express-as></voice></speak>`
}
