import { Runtime as Controls } from '@bimser/form-controls';

export class Designer extends Controls.Form {
    __loadStyles(formName: string) {
        const module = require(`./${formName}.css`);
 
        return module?.default?.map?.(style => {
            const styleTag = document.createElement("style");
 
            if (style) {
                styleTag.setAttribute('file-name', style[0]?.split?.("!")?.[1])
                styleTag.innerHTML = style[1];
            }
 
            return styleTag;
        }) || [];
    }

    // properties
    Section1: Controls.Section;
Column1: Controls.Column;

}