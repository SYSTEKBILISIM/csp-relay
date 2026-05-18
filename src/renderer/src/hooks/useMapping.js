import { useState } from 'react';

export const useMapping = (initialObjects = []) => {
    const [objects, setObjects] = useState(initialObjects);

    const addObject = () => {
        const newObj = {
            key: Date.now(),
            name: '',
            type: 'Object',
            mapping: { source: 'Excel' }
        };
        setObjects([...objects, newObj]);
    };

    const removeObject = (key) => {
        setObjects(prev => prev.filter(obj => obj.key !== key));
    };

    const moveObject = (index, direction) => {
        setObjects(prev => {
            const newObjects = [...prev];
            if (direction === -1 && index > 0) {
                [newObjects[index], newObjects[index - 1]] = [newObjects[index - 1], newObjects[index]];
            } else if (direction === 1 && index < newObjects.length - 1) {
                [newObjects[index], newObjects[index + 1]] = [newObjects[index + 1], newObjects[index]];
            }
            return newObjects;
        });
    };

    const reorderObjects = (startIndex, endIndex) => {
        setObjects(prev => {
            const result = [...prev];
            const [removed] = result.splice(startIndex, 1);
            result.splice(endIndex, 0, removed);
            return result;
        });
    };

    const updateObject = (key, field, value) => {
        setObjects(prev => prev.map(obj =>
            obj.key === key ? { ...obj, [field]: value } : obj
        ));
    };

    const updateMapping = (key, mappingUpdates) => {
        setObjects(prev => prev.map(obj =>
            obj.key === key ? { ...obj, mapping: { ...obj.mapping, ...mappingUpdates } } : obj
        ));
    };

    return {
        objects,
        setObjects,
        addObject,
        removeObject,
        moveObject,
        reorderObjects,
        updateObject,
        updateMapping
    };
};
