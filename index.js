//url of the data
const DATA_URL = 'data.csv';

//keep reference to the data once it is loaded
let DATA_FROM_FILE;
let STATE_JSON_URL = 'states-10m.json';
let stateTopoJSONData;


//start the chart process here
Promise.all([d3.json(STATE_JSON_URL), d3.csv(DATA_URL, function (d) {
    d['date'] = d3.timeParse("%Y-%m-%d")(d['date']);
    d['n_killed'] = +d['n_killed'];
    d['n_injured'] = +d['n_injured'];
    return d;
})]).then(data => {
    stateTopoJSONData = data[0];
    data[1].sort((a, b) => a.date - b.date);
    DATA_FROM_FILE = data[1];
    setupStateMapAndSlider();
    drawLineChart();
    drawStateMap();
    drawStackedBar();
    setupChartTypeChangeListener();

});


let linechartData = null;

function drawLineChart() {
    //the chart has been drawn already
    if (linechartData !== null)
        return;

    linechartData = DATA_FROM_FILE.map(d => {
        return {
            date: d['date'],
            totalVictims: d['n_killed'] + d['n_injured']
        }
    });

    //group the data by year
    linechartData = d3.nest().key(function (d) {
        return new Date(d.date).getFullYear();
    }).rollup(function (v) {
        return d3.sum(v, (d) => d.totalVictims);
    })
        .entries(linechartData).map(function (d) {
            return {
                date: d3.timeParse('%Y')(d.key),
                totalVictims: d.value
            }
        });
    d3.select('#table').select('tbody').selectAll('tr')
        .data(linechartData)
        .enter()
        .append('tr')
        .html(d => {
            return `<td style="border: 1px solid black">${new Date(d.date).getFullYear()}</td>
 <td style="border: 1px solid black">${d.totalVictims}</td>`
        });
    d3.selectAll('td')
        .style('width', '50%');

    // set the dimensions and margins of the graph
    let margin = {top: 20, right: 80, bottom: 50, left: 60},
        width = 490 - margin.left - margin.right,
        height = 540 - margin.top - margin.bottom;

    // set the ranges
    let xScale = d3.scaleTime().range([0, width])
        .domain(d3.extent(linechartData, function (d) {
            return d['date'];
        }));
    let yScale = d3.scaleLinear().range([height, 0])
        .domain([0, d3.max(linechartData, function (d) {
            return d['totalVictims'];
        })]);

    // Line function
    let lineFunc = d3.line()
        .x(function (d) {
            return xScale(d['date']);
        })
        .y(function (d) {
            return yScale(d['totalVictims']);
        });

    //svg element
    let svg = d3.select("#line-chart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    // Add the valueline path.
    svg.append("path")
        .data([linechartData])
        .attr("class", "line")
        .attr("d", lineFunc);

    // Add the X Axis
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(xScale));

    // Add the Y Axis
    svg.append("g")
        .call(d3.axisLeft(yScale));

    //add the X label
    svg.append('text').attr('x', width / 2)
        .attr('y', height + 30)
        .style('text-anchor', 'middle')
        .text('Year');

    //add the Y label
    svg.append('text').attr('y', -32)
        .attr('x', -height / 2)
        .style('text-anchor', 'middle')
        .attr("transform", "rotate(-90)")
        .text('Total Victims')
}

let stackBarData = null;

let stackTip = d3.tip().attr('class', 'd3-tip').offset([10, 10])
    .html(function (d) {
        return "<div class='tooltip'>" +
            "Status: " + d.name +
            "<br/> Total Victims: " + d.value + '</div>'
    });

function drawStackedBar() {
    //the chart has been drawn already
    if (stackBarData !== null)
        return;
    stackBarData = [];
    DATA_FROM_FILE.forEach((d) => {
        /**
         * calculate the user gender
         */
        let genderStr = d['participant_gender'];
        let delimiter = '||';
        let allGenderArr = genderStr.split(delimiter);
        let victimDetails = {};
        let keyValueDelimiter = "::";
        allGenderArr.forEach((g) => {
            let [index, gender] = g.split(keyValueDelimiter);
            victimDetails[index] = {
                gender: (gender === 'Male' || gender === 'Female') ? gender : 'Male/Female'
            }
        });

        /**
         * Extract participant status
         */
        let participantStatus = d['participant_status'];
        let allParticipantStatusArr = participantStatus.split(delimiter);
        let knownStatus = ['Arrested', 'Killed', 'Injured', 'Unharmed'];
        allParticipantStatusArr.forEach((s) => {
            let [index, status] = s.split(keyValueDelimiter);
            if (victimDetails[index]) {
                victimDetails[index]['status'] = knownStatus.includes(status) ? status : "Other";
                return;
            }
            victimDetails[index] = {
                gender: 'Male/Female',
                status: knownStatus.includes(status) ? status : "Other"
            }
        });
        Object.keys(victimDetails).forEach(k => {
            stackBarData.push(victimDetails[k]);
        });
    });
    stackBarData = d3.nest().key(function (d) {
        return d.gender + " : " + (d.status && d.status !== 'undefined' ? d.status : 'Other');
    }).rollup(function (v) {
        return {total: v.length, gender: v[0].gender, status: v[0].status}
    }).entries(stackBarData).map(d => d.value).filter(d => d.status);

    /**
     * draw the Stacked Bar Chart
     */
    let margin = {top: 50, right: 50, bottom: 50, left: 50}
        , width = 360 - margin.left - margin.right
        , height = 550 - margin.top - margin.bottom;

    // setup the scales
    let xScale = d3.scaleBand().range([0, width]).padding(.3);
    let yScale = d3.scaleLinear()
        .range([height, 0]);

    //setup the axes
    let xAxis = d3.axisBottom()
        .scale(xScale);

    let yAxis = d3.axisLeft()
        .scale(yScale);

    let columnHeaders = [];
    stackBarData.forEach(d => {
        if (!columnHeaders.includes(d.status)) {
            columnHeaders.push(d.status);
        }
    });

    //generate random colors for each status
    let colors = columnHeaders.map(d => getRandomColor(d));

    let colorScale = d3.scaleOrdinal()
        .domain(columnHeaders)
        .range(colors);

    //group by gender
    let data = d3.nest().key(function (d) {
        return d.gender;
    })
        .rollup((v) => {
            let obj = {};
            v.forEach(d => {
                obj[d.status] = d.total;
            });
            return obj;
        }).entries(stackBarData).map(d => {
            return {gender: d.key, ...d.value}
        });

    data.forEach((d) => {
        columnHeaders.forEach((c) => {
            if (!d[c]) {
                d[c] = 0;
            }
        })
    });

    data.forEach(function (d) {
        let yColumn = [];
        d.columnDetails = columnHeaders.map(function (name, index) {
            let yBegin = index === 0 ? 0 : yColumn[index - 1].yEnd;
            let yEnd = yBegin + (+d[name]);
            yColumn[index] = {yEnd};
            return {name: name, yBegin, yEnd, value: +d[name]}
        });
        d.total = d3.max(d.columnDetails, function (d) {
            return d.yEnd;
        });
    });
    data.sort((a, b) => {
        return a['gender'].length - b['gender'].length;
    });
    xScale.domain(data.map(function (d) {
        return d.gender;
    }));
    yScale.domain([0, d3.max(data, function (d) {
        return d.total;
    })]);

    let svg = d3.select("#stack-bar-chart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .call(stackTip);

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    let stackedBars = svg.selectAll(".stackedbar")
        .data(data)
        .enter().append("g")
        .attr("class", "stackedbar")
        .attr("transform", function (d) {
            return "translate(" + xScale(d.gender) + ",0)";
        });

    stackedBars.selectAll("rect")
        .data(function (d) {
            return d.columnDetails;
        })
        .enter().append("rect")
        .attr("width", xScale.bandwidth())
        .attr("x", 0)
        .attr("y", function (d) {
            return yScale(d.yEnd);
        })
        .attr("height", function (d) {
            return yScale(d.yBegin) - yScale(d.yEnd);
        })
        .style("fill", function (d) {
            return colorScale(d.name);
        })
        .on('mouseover', stackTip.show)
        .on('mouseout', stackTip.hide)
        .call(stackTip);

    stackedBars.append("text")
        .attr('y', function (d) {
            let lastItem = d.columnDetails[d.columnDetails.length - 1];
            return yScale(lastItem.yEnd) - 5;
        })
        .attr("x", xScale.bandwidth() / 2)
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text(function (d) {
            let lastItem = d.columnDetails[d.columnDetails.length - 1];
            return lastItem.yEnd
        });

    //add legend
    var legend = svg.selectAll(".legend")
        .data(columnHeaders.slice().reverse())
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", function (d, i) {
            return "translate(0," + i * 20 + ")";
        });

    legend.append("circle")
        .attr("cx", width - 43)
        .attr("r", 5)
        .style("fill", colorScale);

    legend.append("text")
        .attr("x", width - 32)
        .attr("dy", ".35em")
        .text(function (d) {
            return d;
        });
// add axis labels
    svg.append("text").attr("x", -height / 2).attr("y", -40).attr("transform", "rotate(-90)")
        .style("font-size", "15px").style("font-weight", "bold")
        .style("text-anchor", "middle").text('Participant Status');
    svg.append("text").attr("x", width / 2).attr("y", height + 40)
        .style("font-size", "15px").style("font-weight", "bold")
        .style("text-anchor", "middle").text('Gender');
}


let stateData = null;
let currentYear;
let margin = {top: 50, right: 50, bottom: 50, left: 50};
let width = 924 - margin.left - margin.right;
let height = 600 - margin.top - margin.bottom;
let projection = d3.geoAlbersUsa();
let path = d3.geoPath().projection(projection);
let tip = d3.tip().attr('class', 'd3-tip').offset([10, 10])
    .html(function (d) {
        return "<div class='tooltip'>State: " + d.properties.name +
            "<br /> Year: " + d.properties.year +
            "<br/> Total Victims: " + d.properties.value + '</div>'
    });
let YEARS;

let svg = d3.select("#state-map-container").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
    .call(tip);

/**
 * Legend config
 */

const legendWidth = 100;
const legendHeight = 500;
const legendSVG = d3.select("#state-map-container").append("svg")
    .attr("width", legendWidth)
    .attr("height", legendHeight);
const linearGradient = legendSVG
    .append("linearGradient")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", 1)
    .attr("y2", 0)
    .attr("id", "legend-linear-gradient");
const legendTitle = legendSVG
    .append("text")
    .attr("text-anchor", "middle")
    .attr('y', -8)
    .attr("transform", `translate(${legendWidth / 2}, 25)`)
    .text("Total Victims");
const legendG = legendSVG
    .append("g")
    .attr("transform", `translate(20, 35)`);
legendG
    .append("rect")
    .attr("width", 20)
    .style("fill", "url(#legend-linear-gradient)");
const color = d3.scaleLinear().range(['#F5B8B1', '#FD5822']);

function updateLegend() {
    linearGradient
        .selectAll("stop")
        .data(
            color.ticks().map((t, i, n) => ({
                offset: `${(100 * i) / n.length}%`,
                color: color(t)
            }))
        )
        .join("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
    const y = d3
        .scaleLinear()
        .domain(color.domain())
        .range([legendHeight - 45, 0]);
    legendG.call(g => g.select("rect").attr("height", y.range()[0]));
    legendG
        .selectAll(".tick")
        .data(color.ticks())
        .join("text")
        .attr("class", "tick")
        .attr("transform", d => `translate(25,${y(d)})`)
        .attr("dy", "0.32em")
        .text(d => d);
}


function setupStateMapAndSlider() {
    stateData = d3.nest().key(function (d) {
        return new Date(d.date).getFullYear();
    }).key(function (d) {
        return d.state;
    })
        .object(DATA_FROM_FILE);

    YEARS = Object.keys(stateData).sort();
    currentYear = YEARS[0];

    /**
     * Setup the slider
     */
    var sliderSimple = d3
        .sliderBottom()
        .step(1000 * 60 * 60 * 24 * 365)
        .min(new Date(+currentYear, 10, 3))
        .max(new Date(YEARS[YEARS.length - 1], 10, 3))
        .width(300)
        .tickFormat(d3.timeFormat('%Y'))
        .default(new Date(currentYear))
        .tickValues(YEARS.map(function (year) {
            return new Date(+year, 10, 3);
        }))
        .on('onchange', function (val) {
            var year = d3.timeFormat('%Y')(val);
            if (year === currentYear) return;
            currentYear = year;
            drawStateMap();
        });

    var gSimple = d3
        .select('div#year-slider')
        .append('svg')
        .attr('width', 500)
        .attr('height', 70)
        .append('g')
        .attr('transform', 'translate(90,30)');
    gSimple.call(sliderSimple);
}

function drawStateMap() {
    let data = stateData[currentYear];

    data = Object.keys(data).map(d => {
        return {
            state: data[d][0].state,
            totalVictims: d3.sum(data[d], (e) => e['n_killed'] + e['n_injured'])
        }
    });
    color.domain([0, d3.max(data, (d) => d.totalVictims)]).nice();

    svg.selectAll('*').remove();
    svg.append("g").attr("class", "states").selectAll("path")
        .data(topojson.feature(stateTopoJSONData, stateTopoJSONData.objects.states).features).enter()
        .append("path").attr("d", path)
        .style('stroke', 'black')
        .style('opacity', 0.8)
        .style("fill", function (d) {
            let state = d.properties.name;
            for (let i = 0; i < data.length; i++) {
                if (state === data[i].state) {
                    d.properties["value"] = data[i].totalVictims;
                    d.properties['year'] = currentYear;
                    break
                } else {
                    d.properties["value"] = 0;
                    d.properties['year'] = currentYear;
                }
            }
            return color(d.properties.value);
        })
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide)
        .call(tip);
    updateLegend()
}


/***
 *
 * UTIL FUNCTION SECTION
 *
 *
 */



let functionMaps = {
    'line-chart': drawLineChart,
    'stack-bar-chart': drawStackedBar,
    'state-map': drawStateMap
};

/**
 * listen for change
 */
function setupChartTypeChangeListener() {
    d3.select('#chart-type').on('change', function () {
        let chartType = d3.select(this).property('value');
        functionMaps[chartType]();
        showHide(chartType);
    })
}


function showHide(id) {
    //hide the other chart types
    Object.keys(functionMaps).forEach(key => {
        if (key === id) {
            document.getElementById(key).style.display = 'block';
            return;
        }
        document.getElementById(key).style.display = 'none';
    });
}

/**
 *
 * @returns {string} the randomly generated color
 */
function getRandomColor(str) {
    return {
        "Unharmed": "#EC7063",
        "Other": "#F7DC6F",
        "Injured": "#5DADE2",
        "Killed": "#DC7633",
        "Arrested": "#A569BD"
    }[str];
}
