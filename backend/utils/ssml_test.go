package utils

import (
	"encoding/xml"
	"io"
	"os"
	"strings"
	"testing"
)

func TestEscapeSSML_BackgroundChunkSpeaksOnlyBookText(t *testing.T) {
	// The frontend contract test generates this same chunk through Foliate and
	// TTSSpeechBuffer, so changes to either side cannot silently drift apart.
	input, err := os.ReadFile("testdata/background-tts.ssml")
	if err != nil {
		t.Fatal(err)
	}
	decoder := xml.NewDecoder(strings.NewReader(EscapeSSML(strings.TrimSpace(string(input)))))
	var spoken strings.Builder
	var languages []string
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("sanitized speech must be valid XML: %v", err)
		}
		switch token := token.(type) {
		case xml.StartElement:
			if token.Name.Local == "lang" {
				for _, attr := range token.Attr {
					if attr.Name.Space == "http://www.w3.org/XML/1998/namespace" &&
						attr.Name.Local == "lang" {
						languages = append(languages, attr.Value)
					}
				}
			}
		case xml.CharData:
			spoken.Write(token)
		}
	}
	if got, want := spoken.String(), "第一句。Second sentence."; got != want {
		t.Errorf("speech contains XML markup instead of only book text: got %q, want %q", got, want)
	}
	if got := strings.Join(languages, ","); got != "zh-CN,en-US" {
		t.Errorf("sentence language elements were not preserved: %q", got)
	}
}

func TestEscapeSSML_PreservesLanguageElementsOnly(t *testing.T) {
	for _, input := range []string{
		`<lang>正文</lang>`,
		`<lang xml:lang="zh-CN">正文</lang>`,
		`<lang xml:lang="en-US"/>`,
	} {
		if output := EscapeSSML(input); output != input {
			t.Errorf("language markup changed: got %q, want %q", output, input)
		}
	}
	for _, input := range []string{`<language>正文</language>`, `<lang-unsafe>正文</lang-unsafe>`} {
		if output := EscapeSSML(input); strings.Contains(output, "<") {
			t.Errorf("unknown tag must still be escaped: %q", output)
		}
	}
}

func TestEscapeSSML_PreservesSpeakWithAttributes(t *testing.T) {
	input := `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoMultilingualNeural"><mstts:express-as style="general" styledegree="1.0"><prosody rate="+0%">你好世界</prosody></mstts:express-as></voice></speak>`

	output := EscapeSSML(input)

	if !strings.Contains(output, "<speak ") {
		t.Errorf("expected <speak ...> to be preserved in output: %s", output)
	}
	if !strings.Contains(output, "</speak>") {
		t.Errorf("expected </speak> to be preserved in output: %s", output)
	}
	if !strings.Contains(output, "<voice ") {
		t.Errorf("expected <voice ...> to be preserved in output: %s", output)
	}
	if !strings.Contains(output, "</voice>") {
		t.Errorf("expected </voice> to be preserved in output: %s", output)
	}
	if !strings.Contains(output, "<prosody ") {
		t.Errorf("expected <prosody ...> to be preserved in output: %s", output)
	}
	if strings.Contains(output, "&lt;speak") {
		t.Errorf("expected <speak ...> NOT to be escaped: %s", output)
	}
	if strings.Contains(output, "&lt;voice") {
		t.Errorf("expected <voice ...> NOT to be escaped: %s", output)
	}
}

func TestEscapeSSML_PreservesSpeakWithoutAttributes(t *testing.T) {
	input := `<speak><voice name="test">hello</voice></speak>`

	output := EscapeSSML(input)

	if !strings.Contains(output, "<speak>") {
		t.Errorf("expected <speak> to be preserved in output: %s", output)
	}
	if !strings.Contains(output, "</speak>") {
		t.Errorf("expected </speak> to be preserved in output: %s", output)
	}
}

func TestEscapeSSML_EscapesUserContent(t *testing.T) {
	input := `<speak version="1.0"><voice name="test"><prosody rate="+0%">Hello <world> & "test"</prosody></voice></speak>`

	output := EscapeSSML(input)

	// User content containing < and > should be escaped
	if !strings.Contains(output, "&lt;world&gt;") {
		t.Errorf("expected <world> to be escaped: %s", output)
	}
	if !strings.Contains(output, "&quot;test&quot;") {
		t.Errorf("expected quotes to be escaped: %s", output)
	}
}

func TestEscapeSSML_PreservesPTag(t *testing.T) {
	input := `<speak><p>paragraph one</p><p class="test">paragraph two</p></speak>`

	output := EscapeSSML(input)

	if !strings.Contains(output, "<p>") {
		t.Errorf("expected <p> to be preserved: %s", output)
	}
	if !strings.Contains(output, "</p>") {
		t.Errorf("expected </p> to be preserved: %s", output)
	}
	if !strings.Contains(output, `<p class="test">`) {
		t.Errorf("expected <p class=\"test\"> to be preserved: %s", output)
	}
}

func TestEscapeSSML_PreservesBreakTag(t *testing.T) {
	input := `<speak><voice name="test"><prosody>hello<break time="500ms"/>world</prosody></voice></speak>`

	output := EscapeSSML(input)

	if !strings.Contains(output, `<break time="500ms"/>`) {
		t.Errorf("expected <break/> to be preserved: %s", output)
	}
}

func TestEscapeSSML_PreservesBookmarkTag(t *testing.T) {
	input := `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="test"><prosody rate="+0%"><bookmark mark="0"/>第一章<bookmark mark="1"/>正文</prosody></voice></speak>`

	output := EscapeSSML(input)

	if !strings.Contains(output, `<bookmark mark="0"/>`) {
		t.Errorf("expected <bookmark mark=\"0\"/> to be preserved: %s", output)
	}
	if !strings.Contains(output, `<bookmark mark="1"/>`) {
		t.Errorf("expected <bookmark mark=\"1\"/> to be preserved: %s", output)
	}
	if strings.Contains(output, "&lt;bookmark") {
		t.Errorf("expected <bookmark/> NOT to be escaped: %s", output)
	}
}
