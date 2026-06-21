/* Unique-ish word ids. Shared so store + components agree on the scheme. */
let _idc = Date.now();
export const newId = () => "w" + (_idc++).toString(36) + Math.random().toString(36).slice(2, 6);
