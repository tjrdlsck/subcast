// ==========================================================================
// Bible Slide Generator & Text Splitter Module
// ==========================================================================

function splitTextByLength(text, maxLen = 80) {
    if (!text) return [""];
    if (text.length <= maxLen) return [text];

    // 개행 문자(\n) 분할을 먼저 처리
    const lines = text.split("\n");
    const chunks = [];
    let current = "";

    lines.forEach(line => {
        const words = line.split(" ");
        words.forEach(word => {
            if (!word) return;

            // 단일 단어가 maxLen보다 긴 경우 강제 슬라이싱 분할
            if (word.length > maxLen) {
                if (current) {
                    chunks.push(current.trim());
                    current = "";
                }
                for (let i = 0; i < word.length; i += maxLen) {
                    chunks.push(word.substring(i, i + maxLen));
                }
                return;
            }

            if ((current + " " + word).trim().length > maxLen) {
                if (current) chunks.push(current.trim());
                current = word;
            } else {
                current = (current + " " + word).trim();
            }
        });

        if (current) {
            chunks.push(current.trim());
            current = "";
        }
    });

    if (current) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
}

function createBibleSlideObject(header, content) {
    const slideId = "slide_bible_" + Math.random().toString(36).substr(2, 8);

    return {
        id: slideId,
        name: `성경: ${header}`,
        elements: [
            {
                id: "elem_bible_bg_" + Math.random().toString(36).substr(2, 9),
                type: "rect",
                content: "",
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                style: {
                    fillColor: "#000000",
                    strokeColor: "transparent",
                    strokeWidth: 0,
                    cornerRadius: 0,
                    opacity: 1.0
                }
            },
            {
                id: "elem_bible_h_" + Math.random().toString(36).substr(2, 9),
                type: "text",
                content: header,
                x: 7.2,
                y: 14.8,
                width: 85.0,
                height: 5.0,
                style: {
                    fontSize: "2.2vw",
                    fontColor: "#ffffff",
                    fontFamily: "Inter",
                    fontWeight: "600",
                    textAlign: "left"
                }
            },
            {
                id: "elem_bible_c_" + Math.random().toString(36).substr(2, 9),
                type: "text",
                content: content,
                x: 7.2,
                y: 22.5,
                width: 85.6,
                height: 60.0,
                style: {
                    fontSize: "3.8vw",
                    fontColor: "#ffffff",
                    fontFamily: "Inter",
                    fontWeight: "700",
                    textAlign: "left"
                }
            }
        ]
    };
}
