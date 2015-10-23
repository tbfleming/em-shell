'use strict';

function syncGet(url) {
    let req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send();
    if(req.status === 200)
        return req.responseText;
}

function syncPost(url, data) {
    let req = new XMLHttpRequest();
    req.open("POST", url, false);
    req.send(data);
}

export function print(x) {
    syncPost('service/writeConsole', x);
}

export function stdin() {
    return syncGet('service/readConsole');
}

print('Worker started\r\n');
