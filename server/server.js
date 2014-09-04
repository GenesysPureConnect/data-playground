#!/usr/bin/env node
'use strict';
var express = require('express');
var fs = require('fs');
var path = require('path');
var tmp = require('tmp');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var url = require('url');
var split = require('split');
var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;

function startStaticHost() {
    console.log('Starting Static Host...');
    var app = express();

    app.use(express.static(__dirname + '/public'));
    app.listen(8000);
}

function startRServer() {
    console.log('Starting R Service...');

    var wss = new WebSocketServer({port: 8080});
    wss.on('connection', setupSession);
}

function copyFile(dstDir, srcPath) {
    var dstPath = path.join(dstDir, path.basename(srcPath));
    var srcStream = fs.createReadStream(srcPath);
    var dstStream = fs.createWriteStream(dstPath);

    srcStream.pipe(dstStream);

    return new Promise(function (resolve, reject) {
        dstStream.on('finish', resolve);
        dstStream.on('error', reject);
    });
}

function setupRunDir() {
    var templateDir = '../R';
    var tmpDir = Promise.promisify(tmp.dir);
    var readDir = Promise.promisify(fs.readdir);

    var fileListPromise = readDir(templateDir)
        .then(function (files) {
            return files.map(function (fileName) {
                return path.join(templateDir, fileName);
            });
        });

    return Promise.all([fileListPromise, tmpDir({unsafeCleanup: true})])
        .spread(function (files, tmpPath) {
            var copy = copyFile.bind(null, tmpPath);
            return Promise.all(files.map(copy))
                .then(function () {
                    return tmpPath;
                });
        })
        .catch(function (err) {
            console.log("Error setting up temp dir!", arguments);
        });
}

function createImgStream(rCWD) {
    var pipePath = path.join(rCWD, 'plot.png');
    var mkfifoProcess = spawn('mkfifo', [pipePath]);
    mkfifoProcess.stderr.on('data', function (err) {
        console.log('mkfifo Error: ' + err);
    });

    var fifoPromise = new Promise(function (resolve, reject) {
        mkfifoProcess.on('exit', function (code) {
            if (code === 0) {
                resolve(pipePath);
            } else {
                reject('Failed to create fifo. Exit status: ' + code);
            }
        });
    });

    return fifoPromise
        .then(function(pipePath) {
            return fs.createReadStream(pipePath, {
                encoding: 'base64'
            });
        });
}

function createJsonStream(rCWD, name) {
    var pipePath = path.join(rCWD, name);
    var mkfifoProcess = spawn('mkfifo', [pipePath]);
    mkfifoProcess.stderr.on('data', function (err) {
        console.log('mkfifo Error: ' + err);
    });

    var fifoPromise = new Promise(function (resolve, reject) {
        mkfifoProcess.on('exit', function (code) {
            if (code === 0) {
                resolve(pipePath);
            } else {
                reject('Failed to create fifo. Exit status: ' + code);
            }
        });
    });

    return fifoPromise
        .then(function(pipePath) {
            return fs.createReadStream(pipePath);
        });
}

function spawnR(env) {
    env.APIDOMAIN = 'https://public-api.us-east-1.inindca.com';

    return setupRunDir()
        .then(function (tmpPath) {
            return Promise.all([
                createImgStream(tmpPath),
                createJsonStream(tmpPath, 'dataframe.json'),
                createJsonStream(tmpPath, 'dflist.json')
            ]).spread(function(plotStream, dataframeStream, dflistStream) {
                    console.log('Spawning R @ %s', tmpPath);
                    var rProc = spawn('R', ['--no-save', '--interactive'], {
                        cwd: tmpPath,
                        env: env
                    });
                    rProc.on('error', function() {
                        console.log('Spawn Error', arguments);
                    });
                    rProc.on('exit', function () {
                        console.log('R exit', arguments);
                    });

                    return {
                        proc: rProc,
                        cwd: tmpPath,
                        plotStream: plotStream,
                        dataframeStream: dataframeStream,
                        dflistStream: dflistStream
                    };
                });
        });
}

function sendData(ws, type, data) {
    var message = {
        type: type,
        data: '' + data
    };
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message), {binary: false});
    }
}

function setupPlotStream(plotStream, send, rInfo) {
    plotStream.on('data', function (plotData) {
        send('plot', plotData);
    });
    plotStream.on('end', function () {
        console.log("Plot stream ended", arguments);
    });
    plotStream.on('readable', function () {
        console.log("Plot stream has data", arguments);
    });
    plotStream.on('close', function () {
        console.log("Plot stream closed", arguments);
        send('plot', '');
        plotStream = fs.createReadStream(path.join(rInfo.cwd, 'plot.png'), {
            encoding: 'base64'
        });
        rInfo.plotStream = plotStream;
        setupPlotStream(plotStream, send, rInfo);
    });
    plotStream.on('error', function () {
        console.log("Plot stream error", arguments);
    });
}

function setupDataframeStream(dataframeStream, send, rInfo) {
    dataframeStream.on('data', function (dataframeData) {
        send('dataframe', dataframeData);
    });
    dataframeStream.on('end', function () {
        console.log("Dataframe stream ended", arguments);
    });
    dataframeStream.on('readable', function () {
        console.log("Dataframe stream has data", arguments);
    });
    dataframeStream.on('close', function () {
        console.log("Dataframe stream closed", arguments);
        send('dataframe', '');
        dataframeStream = fs.createReadStream(path.join(rInfo.cwd, 'dataframe.json'));
        rInfo.dataframeStream = dataframeStream;
        setupDataframeStream(dataframeStream, send, rInfo);
    });
    dataframeStream.on('error', function () {
        console.log("Dataframe stream error", arguments);
    });
}

function setupDflistStream(dflistStream, send, rInfo) {
    dflistStream.on('data', function (dflistData) {
        send('dflist', dflistData);
    });
    dflistStream.on('end', function () {
        console.log("Dflist stream ended", arguments);
    });
    dflistStream.on('readable', function () {
        console.log("Dflist stream has data", arguments);
    });
    dflistStream.on('close', function () {
        console.log("Dflist stream closed", arguments);
        send('dflist', '');
        dflistStream = fs.createReadStream(path.join(rInfo.cwd, 'dflist.json'));
        rInfo.dflistStream = dflistStream;
        setupDflistStream(dflistStream, send, rInfo);
    });
    dflistStream.on('error', function () {
        console.log("Dflist stream error", arguments);
    });
}

function setupSession(ws) {
    var queryParams = url.parse(ws.upgradeReq.url, true).query;

    console.log('SESSION', ws.upgradeReq.url);
    spawnR(queryParams).then(function (rInfo) {
        var rProc = rInfo.proc;
        var plotStream = rInfo.plotStream;
        var dataframeStream = rInfo.dataframeStream;
        var dflistStream = rInfo.dflistStream;
        var send = sendData.bind(null, ws);
        var exit = endSession.bind(null, ws, rProc);

        rProc.stderr.on('data', function (err) {
            console.log('ERROR: %s', err);
            send('stderr', err);
        });

        rProc.stdin.on('close', exit);
        rProc.stdout.on('close', exit);
        rProc.stdout.on('data', function (output) {
            console.log('stdout: ' + output);
        });
        rProc.stdout.pipe(split()).on('data', function(line) {
            console.log('line: ' + line);
            if (line.indexOf('#DataPirate') == -1) {
                send('stdout', line + '\n');
            }
        });

        setupPlotStream(plotStream, send, rInfo);
        setupDataframeStream(dataframeStream, send, rInfo);
        setupDflistStream(dflistStream, send, rInfo);

        function silentCommand(cmd) {
            var newCmd = 'invisible(' + cmd + ') #DataPirate\n';
            rProc.stdin.write(newCmd);
        }

        ws.on('message', function (message) {
            var msg = JSON.parse(message);
            if (msg.type == 'stdin') {
                console.log('Got stdin: %s', msg.data);
                rProc.stdin.write(msg.data);
                silentCommand('dev.off()');
                silentCommand('png("plot.png", 1024, 1024)');
                // Update the list of data frames
                silentCommand('write(toJSON(names(sapply(ls(), function(x) class(get(x)))[unlist(sapply(sapply(ls(), function(x) class(get(x))), function(x) "data.frame" %in% x))])), file = "dflist.json")');
            } else if (msg.type == 'dataframe') {
                console.log('Got dataframe request: %s', msg.data);
                silentCommand('write(toJSON(' + msg.data + '), file = "dataframe.json")');
            }
        });

        ws.on('close', function (code, message) {
            console.log('Websocket Close: %s - %s', code, message);
            exit();
        });
    });
}

function endSession(ws, rProc) {
    rProc.kill(); //TODO: do this a better way
    if (ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
    }
}


startStaticHost();
startRServer();
