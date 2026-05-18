import React from 'react';
import { Resizable } from 'react-resizable';

export const ResizableTitle = (props) => {
    const { onResize, width, ...restProps } = props;

    if (!width) {
        return <th {...restProps} />;
    }

    return (
        <Resizable
            width={width}
            height={0}
            handle={
                <span
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 10, width: 10, cursor: 'col-resize' }}
                />
            }
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
        >
            <th {...restProps} />
        </Resizable>
    );
};
