importScripts('jspm_packages/system.js', 'config.js');

var Module;
addEventListener('message', function (e) {
    if (!e.isTrusted || Module)
        return;
    Module = {};
    System.import('js/worker.js').then(function (m) {
        m.start(Module, e.data);
    });
});
