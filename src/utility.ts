'use strict';

export function removeDuplicates<T>(array: T[]): T[] {
    const map = new Map<T, void>();
    const newArray: T[] = [];
    for (const value of array) {
        if (map.get(value) === undefined) {
            newArray.push(value);
            map.set(value);
        }
    }
    return newArray;
}
