'use strict';

function syncGet(url) {
    var req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send();
    if(req.status === 200)
        return req.responseText;
}

function syncPost(url, data) {
    var req = new XMLHttpRequest();
    req.open("POST", url, false);
    req.send(data);
}

function print(x) {
    syncPost('service/writeConsole', x);
}

function stdin() {
    return syncGet('service/readConsole');
}

var Module;
addEventListener('message', function (e) {
    if (!e.isTrusted || Module)
        return;

    Module = {
        thisProgram: e.data.args.shift(),
        arguments: e.data.args,
        print: print,
        printErr: print,
        preInit: function() {
            TTY.ttys[FS.makedev(5, 0)].ops = {
                get_char: function(tty) {
                    if (!tty.input.length) {
                        var result = stdin();
                        if (!result)
                            return null;
                        tty.input = intArrayFromString(result, true);
                    }
                    return tty.input.shift();
                }, put_char: function(tty, val) {
                    print(String.fromCharCode(val));
                }, flush: function(tty) {
                }
            };
        }
    }

    // TODO: notify service of start and termination
    try {
        importScripts(e.data.file);
    } catch (e) {
        console.log(e);
    }
    self.close();
});
