importScripts('jspm_packages/system.js', 'config.js');

var main;

System.import('js/worker.js').then(function (m) {
    main = m;
    importScripts('bin/busybox');
});
