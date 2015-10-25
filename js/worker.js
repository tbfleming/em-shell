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

function print(x) {
    syncPost('service/writeConsole', x);
}

function stdin() {
    return syncGet('service/readConsole');
}

let Module;
export function start(m, msg) {
    Module = m;
    Module.thisProgram = msg.args.shift();
    Module.arguments = msg.args;
    Module.print = print;
    Module.printErr = print;
    Module.preInit = () => {
        TTY.ttys[FS.makedev(5, 0)].ops = {
            get_char: tty => {
                if (!tty.input.length) {
                    var result = stdin();
                    if (!result)
                        return null;
                    tty.input = intArrayFromString(result, true);
                }
                return tty.input.shift();
            }, put_char: (tty, val) => {
                print(String.fromCharCode(val));
            }, flush: tty => {
            }
        };
    };

    importScripts(msg.file);
}
