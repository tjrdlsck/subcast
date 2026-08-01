// ==========================================================================
// Subcast Module: editor-utils.js
// ==========================================================================

        // 다양한 형식의 색상 문자열을 hex 코드(#rrggbb)로 변환해주는 안전한 헬퍼 함수
        function colorToHex(color) {
            if (!color) return "#ffffff";
            if (color === "transparent") return "#ffffff";
            if (color.startsWith("#")) return color;

            // rgb/rgba 변환 또는 HTML5 Canvas fillStyle 리턴값의 안정성을 위한 임시 Canvas Context 파서 활용
            try {
                const ctx = document.createElement('canvas').getContext('2d');
                ctx.fillStyle = color;
                const parsedColor = ctx.fillStyle;
                if (parsedColor.startsWith("#")) {
                    return parsedColor;
                }
            } catch (e) {
                // 파싱 에러 방어
            }

            // 기본 Regex 매칭 방어 코드
            const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i);
            if (match) {
                const r = parseInt(match[1]).toString(16).padStart(2, '0');
                const g = parseInt(match[2]).toString(16).padStart(2, '0');
                const b = parseInt(match[3]).toString(16).padStart(2, '0');
                return `#${r}${g}${b}`;
            }
            return "#ffffff";
        }


        // 컬러 문자열(HEX, rgba, rgb)로부터 투명도(Alpha) 비율 0~100 획득
        function colorToOpacity(colorVal) {
            if (!colorVal) return 100;
            if (colorVal === 'transparent') return 0;

            const str = colorVal.toString().trim();
            if (str.startsWith('rgba')) {
                const parts = str.split(',');
                if (parts.length === 4) {
                    const alpha = parseFloat(parts[3].replace(')', ''));
                    return isNaN(alpha) ? 100 : Math.round(alpha * 100);
                }
            } else if (str.startsWith('#') && str.length === 9) {
                const alphaHex = str.substring(7, 9);
                const alphaVal = parseInt(alphaHex, 16) / 255;
                return isNaN(alphaVal) ? 100 : Math.round(alphaVal * 100);
            }
            return 100;
        }


        // HEX 색상코드와 opacity 비율(0~100)을 받아서 rgba() 문자열 조립
        function hexAndOpacityToRgba(hex, opacityPercent) {
            if (!hex) return 'transparent';
            if (hex.toUpperCase() === 'TRANSPARENT') return 'transparent';

            let cleanHex = hex.trim().replace('#', '');
            if (cleanHex.length === 3) {
                cleanHex = cleanHex.split('').map(c => c + c).join('');
            }
            if (cleanHex.length !== 6) return hex;

            const r = parseInt(cleanHex.substring(0, 2), 16);
            const g = parseInt(cleanHex.substring(2, 4), 16);
            const b = parseInt(cleanHex.substring(4, 6), 16);
            const a = (opacityPercent / 100).toFixed(2);

            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }


