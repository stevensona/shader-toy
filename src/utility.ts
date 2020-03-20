'use strict';

export function removeDuplicates<T>(array: T[]): T[] {
    var map = new Map<T, void>();
    var newArray: T[] = [];
    for (let value of array) {
        if (map.get(value) === undefined) {
            newArray.push(value);
            map.set(value);
        }
    }
    return newArray;
}
