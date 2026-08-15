// ==========================================================================
// Bible Slide Generator & Text Splitter Module
// ==========================================================================

function splitTextByLength(text, maxLen) {
    if (text.length <= maxLen) return [text];

    const words = text.split(" ");
    const chunks = [];
    let current = "";

    words.forEach(word => {
        if ((current + " " + word).trim().length > maxLen) {
            if (current) chunks.push(current.trim());
            current = word;
        } else {
            current = (current + " " + word).trim();
        }
    });
    if (current) chunks.push(current.trim());

    return chunks;
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
