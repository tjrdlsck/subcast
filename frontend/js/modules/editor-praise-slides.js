// ==========================================================================
// Praise Slide Generator & Geometric Layout Module
// ==========================================================================

function getGeometricLocationName(x, y) {
    let vPos = "";
    if (y < 33) {
        vPos = "상단";
    } else if (y <= 66) {
        vPos = "중앙";
    } else {
        vPos = "하단";
    }

    let hPos = "";
    if (x < 33) {
        hPos = "좌측";
    } else if (x <= 66) {
        hPos = "중앙";
    } else {
        hPos = "우측";
    }

    if (vPos === "중앙" && hPos === "중앙") {
        return "정중앙";
    }
    return vPos + " " + hPos;
}

function createPraiseSlideObject(header, content, styleOptions) {
    const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
    const elements = [];

    // 1. 배경 설정
    if (styleOptions.backgroundType === "black") {
        elements.push({
            id: "elem_praise_bg_" + Math.random().toString(36).substr(2, 9),
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
        });
    } else if (styleOptions.backgroundType === "bar" && content && content.trim() !== "") {
        let barY = 38.0;
        if (styleOptions.position === "top") barY = 6.0;
        if (styleOptions.position === "bottom") barY = 70.0;

        elements.push({
            id: "elem_praise_bg_bar_" + Math.random().toString(36).substr(2, 9),
            type: "rect",
            content: "",
            x: 0.0,
            y: barY,
            width: 100.0,
            height: 24.0,
            style: {
                fillColor: "#000000",
                strokeColor: "transparent",
                strokeWidth: 0,
                cornerRadius: 0,
                opacity: 0.65
            }
        });
    }

    // 2. 가사 텍스트 기하학적 Y축 좌표 및 정렬 연산
    let textY = 38.0;
    let textX = 7.2;
    let textWidth = 85.6;

    if (styleOptions.position === "top") {
        textY = 12.0;
    } else if (styleOptions.position === "bottom") {
        textY = 76.0;
    }

    if (styleOptions.textAlign === "left") {
        textX = 7.2;
        textWidth = 85.6;
    }

    elements.push({
        id: "elem_praise_c_" + Math.random().toString(36).substr(2, 9),
        type: "text",
        content: content,
        x: textX,
        y: textY,
        width: textWidth,
        height: 20.0,
        style: {
            fontSize: styleOptions.fontSize,
            fontColor: styleOptions.fontColor,
            fontFamily: "Inter",
            fontWeight: "700",
            textAlign: styleOptions.textAlign,
            strokeColor: styleOptions.fontColor === "#ffffff" ? "#000000" : "transparent",
            strokeWidth: styleOptions.fontColor === "#ffffff" ? 3 : 0
        }
    });

    return {
        id: slideId,
        name: `찬양: ${header}`,
        slideType: 'praise',
        isPraise: true,
        elements: elements
    };
}

function createSlideFromTemplateExplicit(tpl, header, contentBlock, targetElementId) {
    const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
    const clonedElements = JSON.parse(JSON.stringify(tpl.elements));

    clonedElements.forEach(elem => {
        const oldId = elem.id;
        elem.id = "elem_praise_" + Math.random().toString(36).substr(2, 9);

        if (elem.type === "text" && oldId === targetElementId) {
            elem.content = contentBlock;
        }
    });

    return {
        id: slideId,
        name: `자막(템): ${header}`,
        slideType: 'praise',
        isPraise: true,
        elements: clonedElements
    };
}
