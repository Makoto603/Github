    var title = [];
    main();

    function main() {
        var today = new Date();
        var filename = ( "0"+( today.getMonth()+1 ) ).slice(-2)+
( "0"+today.getDate() ).slice(-2) + "_temp_log.csv";
        var req = new XMLHttpRequest();
        var filePath = "./temp/" + filename; //CSVファイルのパスは適宜変更してください。
        req.open('GET', filePath, true);
        req.onload = function() {
            data = csv2Array(req.responseText);
            drawBarChart(data);
        }
        req.send(null);
    };

    function csv2Array(str) { //
        var csvData = [];
        var lines = str.split('\n');
        title = lines[0].split(',');
        for (var i = 1; i < lines.length; ++i) {
            var cells = lines[i].split(',');
            csvData.push(cells);
        };
        return csvData;
    };

    function drawBarChart(data) {
        var tmpLabels = [], //ラベル（項目はひとつ）
            tmpData1 = [];
        for (var row in data) {
            tmpLabels.push(data[row][0])
            tmpData1.push(data[row][1])
        };
        tmpLabels = tmpLabels.slice(0, -1);
        //エクセルでCSVファイルを作るとデータの最後にカンマ（,）が追加されて、グラフに空白列が増えてしまうので最後のカンマを削除する

        var ctx = document.getElementById('myChart').getContext('2d');

        var myChart_csv_sample = new Chart(ctx, {
            type: 'line',
            data: {
                labels: tmpLabels,
                datasets: [
                    {
                        label: "CPU_1",
                        data: tmpData1
                    }
                ]
            },
            options: {
                title: {
                    display: true,
                    text: 'CPU Temp',
                    padding: 8,
                    fontSize: 20,
                    fontStyle: 'normal'
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        fontSize: 14,
                        padding: 10
                    }
                },
                scales: {
                    xAxes: [{
                        scaleLabel: {
                            fontSize: 16
                        },
                        ticks: {
                            fontSize: 10
                        },
                        categoryPercentage: 0.6
                    }],
                    yAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: 'Temp（℃）',
                            fontSize: 14
                        },
                        ticks: {
                            min: 25,
                            max: 45,
                            stepSize: 1,
                            beginAtZero: true
                        }
                    }]
                },
                maintainAspectRatio: false
            }
        });
    };
