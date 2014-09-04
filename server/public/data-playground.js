(function ($, _) {
    'use strict';
    var hostname = window.location.hostname;
    var ws = new WebSocket('ws://' + hostname + ':8080/' + window.location.search);
    var workingPlot;
    var recentCommands = [];
    var recentCommandIndex = -1;
    var MAX_RECENT_COMMANDS = 50;

    function getElement(className) {
        return document.querySelector('.data-playground .' + className);
    }

    function scrollElement(element) {
        element.scrollTop = element.scrollHeight;
    }

    var elements = {
        playground: document.querySelector('.data-playground'),
        history: getElement('history'),
        prompt: getElement('prompt'),
        command: getElement('command'),
        images: getElement('images'),
        plotCarousel: getElement('plot-carousel'),
        plots: getElement('plots'),
        terminalToggle: getElement('terminal-toggle'),
        frameRequest: getElement('dataframe-request'),
        frameInput: getElement('dataframe-name')
    };

    ws.onmessage = function (message) {
        var msg = JSON.parse(message.data);
        if (msg.type === 'stdout') {
            writeStdout(msg.data);
        } else if (msg.type === 'stderr') {
            writeStderr(msg.data);
        } else if (msg.type === 'plot') {
            writeImgData(msg.data);
        } else if (msg.type === 'dataframe') {
            writeDataFrame(msg.data);
        } else if (msg.type === 'dflist') {
            writeDataFrameList(msg.data);
        }
    };

    var activeDataFrame = '';
    function writeDataFrame(data) {
        if (data === '') {
            var frameData = JSON.parse(activeDataFrame);
            activeDataFrame = '';
            console.log('GOT FRAME', frameData);

            var $frameTable = $('<table>')
                .addClass('table');
            var $frameHeader = $('<tr>');
            $frameTable.append($frameHeader);
            _.each(_.keys(frameData[0]), function (name) {
                $frameHeader[0].innerHTML += '<th>'+name+'</th>';
            });

            _.each(frameData, function (row) {
                var $tr = $('<tr>');
                _.each(row, function (value) {
                    $tr.append('<td>' + value + '</td>');
                    $frameTable.append($tr);
                });
            });

            $('.frames')
                .empty()
                .append($frameTable);

        } else {
            activeDataFrame += data;
        }

    }

    var activeDFList = '';
    function writeDataFrameList(data) {
        if (data === '') {
            var dfList = JSON.parse(activeDFList);
            activeDFList = '';
            if (dfList.length > 0) {
                $('.dataframes').removeClass('no-frames');
                $('.df-items').empty();
                _.each(dfList, function (frameName) {
                    $('.df-items').append('<li><a class="select-frame" href="#">' + frameName + '</a></li>');
                });
            } else {
                $('.dataframes').addClass('no-frames');
            }
        } else {
            activeDFList += data;
        }
    }

    $('.df-items').on('click', '.select-frame', function (event) {
        event.preventDefault();
        var frameName = $(this).html();
        ws.send(JSON.stringify({
            type: 'dataframe',
            data: frameName
        }));
    });

    function writeStdout(data){
        elements.history.innerHTML += data;
        scrollElement(elements.history);
    }

    function writeStderr(data) {
        elements.history.innerHTML += '<span class="text-warning">' + data + '</span>';
        scrollElement(elements.history);
    }

    function createPlotImage(data) {
        var URI_PREFIX = 'data:image/png;base64,';
        var plotLi = document.createElement('li');
        var $plotCarousel = $(elements.plotCarousel);
        workingPlot = document.createElement('img');
        workingPlot.src = URI_PREFIX;

        $('.display').removeClass('no-images');
        $('.plot-tab a').tab('show');
        plotLi.appendChild(workingPlot);
        elements.plots.appendChild(plotLi);
        $plotCarousel.jcarousel('reload');
        var toScroll = elements.plots.childNodes.length;
        $plotCarousel.jcarousel('scroll', '+=' + toScroll);
    }

    function writeImgData(data) {
        if (data.length === 0) {
            workingPlot = null;
        } else {
            if (!workingPlot) {
                createPlotImage(data);
            }
            workingPlot.src += data;
        }
    }

    function addRecentCommand(cmd) {
        recentCommands.unshift(cmd);
        var len = recentCommands.length;
        if (len > MAX_RECENT_COMMANDS) {
            recentCommands = recentCommands.slice(0, MAX_RECENT_COMMANDS);
        }
        recentCommandIndex = -1;
    }

    function getRecentCommand(index) {
        if (index < 0) {
            return '';
        } else {
            return recentCommands[index];
        }
    }

    function readCommand (element) {
        var cmd = element.value;
        element.value = '';
        return cmd;
    };

    elements.prompt.addEventListener('submit', function (event) {
        event.preventDefault();
        var cmd = readCommand(elements.command);
        addRecentCommand(cmd);
        console.log('Sending command: ', cmd);
        var message = JSON.stringify({
            type: 'stdin',
            data: cmd + '\n'
        });

        ws.send(message);
    });

    /*
    elements.frameRequest.addEventListener('submit', function (event) {
        event.preventDefault();
        var frame = readCommand(elements.frameInput);
        console.log('Requesting frame: ', frame);
        ws.send(JSON.stringify({
            type: 'dataframe',
            data: frame
        }));
    });
   */

    elements.prompt.addEventListener('keyup', function(event) {
        if (event.keyCode === 38) {
            if (recentCommandIndex < recentCommands.length - 1) {
                recentCommandIndex++;
            }
            elements.command.value = getRecentCommand(recentCommandIndex);
        } else if (event.keyCode === 40) {
            if (recentCommandIndex > -1) {
                recentCommandIndex--;
            }
            elements.command.value = getRecentCommand(recentCommandIndex);
        }
    });

    var $carousel = $(elements.plotCarousel);
    $carousel.jcarousel();
    $('.carousel-next').click(function (event) {
        event.preventDefault();
        $carousel.jcarousel('scroll', '+=1');
    });
    $('.carousel-prev').click(function (event) {
        event.preventDefault();
        $carousel.jcarousel('scroll', '-=1');
    });

    $('.show-plots').on('click', function (event) {
        event.preventDefault();
        $(this).tab('show');
    });
    $('.show-frames').on('click', function (event) {
        event.preventDefault();
        $(this).tab('show');
    });

    $(elements.terminalToggle).on('click', function () {
        $(elements.playground).toggleClass('terminal-hidden');
        $carousel.jcarousel('reload');
    });

}(jQuery, _));
