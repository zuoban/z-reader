package utils

import (
	"strings"
	"testing"
)

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
