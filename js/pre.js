var Module = {
    thisProgram: 'sh',
    arguments: [],
    print: main.print,
    printErr: main.print,
    preInit: function () {
        TTY.ttys[FS.makedev(5, 0)].ops = {
            get_char: function (tty) {
                if (!tty.input.length) {
                    var result = main.stdin();
                    if (!result)
                        return null;
                    tty.input = intArrayFromString(result, true);
                }
                return tty.input.shift();
            }, put_char: function (tty, val) {
                main.print(String.fromCharCode(val));
            }, flush: function (tty) {
            }
        }
    },
};
