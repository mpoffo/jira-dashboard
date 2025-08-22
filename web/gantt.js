
function daysToMilliseconds(days) {
    return days * 24 * 60 * 60 * 1000;
}

function prepareIssues2(featuresMap, issues) {
    issues.forEach(issue => {
        issue.feature = featuresMap[issue.feature_key];
        if (!["Epic", "Feature"].includes(issue.type) && !issue.feature) {
            console.log('Feature not found for issue: ', issue.key);
        }
    });


    //mapeia issues para feature_name, issue key, issue summary, assign e start_date
    let issuesWithFeature = issues.map(issue => {
        return {
            rank: issue.rank,
            type: issue.type,
            key: issue.key,
            feature: issue.feature,
            assignee: issue.assignee || 'UNASSIGNED',
            summary: issue.summary,
            start_date: issue.start_date,
            status: issue.status,
            sizeLead: issue.sizeLead

        }
    }).filter(issue => issue.feature && issue.feature?.status != 'Done');
    issuesWithFeature = issuesWithFeature
        .filter(issue => issue.feature.status != 'Done');
    issuesWithFeature = issuesWithFeature
        .sort((a, b) => sortByAssigneeRank(a, b));

    const today = new Date();
    let nextAssigneeDate = {}
    issuesWithFeature.forEach(issue => {
        convertFeatureDateStringToDate(issue.feature)
        let assignee = issue.assignee;
        let featureDate = issue.feature.start_date;
        let issueDate = issue.start_date;
        let assigneeDate = nextAssigneeDate[assignee];
        let date = issueDate || getNextDay(assigneeDate) || featureDate || today;
        endDate = getNextDay(date, issue.sizeLead - 1);
        issue.start_date = date;
        issue.end_date = endDate;
        nextAssigneeDate[assignee] = getNextDay(endDate);
    })
    return issuesWithFeature;
}

function getNextDay(date, days = 1) {
    if (!date) return null;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + days);
    return nextDay;
}

function convertFeatureDateStringToDate(feature) {
    if (feature && feature.start_date && typeof feature.start_date === 'string') {
        feature.start_date = new Date(feature.start_date.replace(/-/g, '/'));
    }
}

function prepareIssues(featuresMap, issues) {
    issues.forEach(issue => {
        issue.feature = featuresMap[issue.feature_key];
    });
    const features = {};
    issues.forEach(issue => {
        if (!features[issue.feature_key]) {
            if (issue.feature && issue.feature.status != 'Done') {
                features[issue.feature_key] = {
                    key: issue.feature_key,
                    summary: issue.feature.summary,
                    start_date: issue.feature.start_date,
                    issues: [issue]
                };
            } else {
                console.log('Feature not found for issue: ', issue.key);
            }
        } else {
            features[issue.feature_key].issues.push(issue);
        }
    });

    Object.keys(features).forEach(featureKey => {
        const feature = features[featureKey];
        const assignees = {};
        feature.issues.forEach(issue => {
            const assignee = issue.assignee || feature.assignee || 'UNASSIGNED';
            issue.assignee = assignee
            if (!assignees[assignee]) assignees[assignee] = [];
            assignees[assignee].push(issue);
        });
        feature.issuesAssignee = assignees;
        Object.keys(feature.issuesAssignee).forEach(assignee => {
            const issuesAssignee = feature.issuesAssignee[assignee];
            let nextAssigneeDate = null
            issuesAssignee.sort((a, b) => a.rank - b.rank);
            //definindo as datas de início e fim
            issuesAssignee.forEach((issue, index) => {
                if (issue.start_date) {//tem startdate na issue
                    issue.end_date = new Date(issue.start_date.getTime() + daysToMilliseconds(issue.sizeLead - 1));
                } else if (index === 0) {//primeira issue da feature
                    if (feature.start_date) {
                        issue.start_date = new Date(feature.start_date);
                        issue.end_date = new Date(issue.start_date.getTime() + daysToMilliseconds(issue.sizeLead - 1));
                    } else if (nextAssigneeDate) {
                        issue.start_date = nextAssigneeDate;
                        issue.end_date = new Date(nextAssigneeDate.getTime() + daysToMilliseconds(issue.sizeLead - 1));
                    } else {
                        console.log('Start date not found for first issue from feature: ', issue.key, feature.key);
                    }
                } else {//não é a primeira issue da feature
                    const previousIssue = issuesAssignee[index - 1];
                    if (previousIssue && previousIssue.end_date) {
                        issue.start_date = new Date(previousIssue.end_date.getTime() + 1);
                        issue.end_date = new Date(issue.start_date.getTime() + daysToMilliseconds(issue.sizeLead - 1));
                    } else {
                        console.log('Previous issue not found for issue: ', issue.key);
                    }

                }
                if (issue.start_date) {
                    nextAssigneeDate = new Date(issue.end_date.getTime() + daysToMilliseconds(1));
                }
            })
        });
    });
    return features
}


function sortByAssigneeRank(a, b) {
    const assigneeCompare = a.assignee.localeCompare(b.assignee);
    if (assigneeCompare !== 0) return assigneeCompare;

    const statusOrder = {
            'Read To Deploy': 1,
            'Review': 2,
            'To Do Review': 3,
            'Code Review': 4,
            'In Progress': 5,
            'To Do': 6,
            'Backlog': 7
        };

    const typeOrder = {
        'Epic': 1,
        'Feature': 2,
        'Story': 3
    }
    const typeA = typeOrder[a.type] || 8; // Default to 8 if type not found
    const typeB = typeOrder[b.type] || 8; // Default to 8 if type not found
    if (typeA !== typeB) {
        //return typeA - typeB;
    }

    const statusA = statusOrder[a.status] || 8; // Default to 8 if status not found
    const statusB = statusOrder[b.status] || 8; // Default to 8 if status not found
    if (statusA !== statusB) {
        //return statusA - statusB;
    }

    return (a.rank + '').localeCompare(b.rank + '');
}

function drawGanttChart(featuresMap, issues) {

    const preparedIssues = prepareIssues2(featuresMap, issues);

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Task ID');
    data.addColumn('string', 'Task Name');
    data.addColumn('string', 'Resource');
    data.addColumn('date', 'Start Date');
    data.addColumn('date', 'End Date');
    data.addColumn('number', 'Duration');
    data.addColumn('number', 'Percent Complete');
    data.addColumn('string', 'Dependencies');

    let tasks = preparedIssues.map(issue => {
        let percComplete = 0;
        if (issue.status === 'Done') {
            percComplete = 100;
        } else if (issue.status === 'In Progress') {
            percComplete = 50; // Assuming 50% for In Progress
        } else if (issue.status === 'To Do') {
            percComplete = 0; // Not started
        } else if (issue.status === 'Backlog') {
            percComplete = 0; // Not started
        } else if (issue.status === 'Review' || issue.status === 'Code Review') {
            percComplete = 75; // Assuming 75% for Review stages
        }
        return {
            id: issue.key,
            name: issue.summary + (percComplete==100 ? ' (Done)' : ''),
            feature: issue.feature,
            type: issue.type,
            assignee: issue.assignee,
            rank: issue.rank,
            resource: issue.feature ? issue.feature.summary : 'S/Feat.',
            start: issue.start_date,
            end: issue.end_date,
            status: issue.status,
            duration: daysToMilliseconds(issue.sizeLead),
            percentComplete: percComplete,
            dependencies: issue.feature_key
        }
    }).sort((a, b) => {
        return sortByAssigneeRank(a, b);
    });

    let itens = [
        [
            'today',             // Task ID (qualquer valor único)
            '',              // Descrição que aparece como tooltip
            null,                // Resource
            new Date(),          // Start   → hoje
            new Date(Date.now() + 24 * 60 * 60 * 1000),
            1, 100, null     // duration, percent, deps
        ]
    ]
    itens = itens.concat(tasks.map(task => [
        task.id,
        task.name + ' (' + task.assignee + ')',
        task.resource,
        new Date(task.start),
        new Date(task.end),
        task.duration,
        task.percentComplete,
        task.dependencies
    ]));
    console.log('Itens: ', itens);
    data.addRows(itens);

    var options = {
        width: '100%',
        height: 2600,
        gantt: {
            sortTasks: false,
            labelStyle: {
                fontSize: 17
            },
            labelMaxWidth: 800,
            trackHeight: 30
        }
    };

    try {
        var chart = new google.visualization.Gantt(document.getElementById('chart_div'));

    } catch (error) {
        console.log('Error creating Gantt chart: ', error);
    }

    google.visualization.events.addListener(chart, 'error', function (err) {
        //  a) mande tudo para o console
        console.error('Google Gantt ⇒', err.message, err.detailedMessage);

        //  b) mostre na tela (opcional)
        google.visualization.errors.addError(
            document.getElementById('error_div'),   // contêiner
            err.message,                            // msg curta
            err.detailedMessage,                    // msg detalhada
            {showInTooltip: true}                  // mostra tudo visível
        );
    });

    google.visualization.events.addListener(chart, 'ready', () => {
        moveTitleToTop();
        showTodayLine();
    });

    chart.draw(data, options);
}

function showTodayLine() {
    //create element like <path d="Mx,y v-size" fill="yellow" stroke="blue" stroke-width="3" />
    let x = parseFloat($("#chart_div g:eq(5) rect:eq(0)").attr('x'));
    let y = parseFloat($("#chart_div g:eq(5) rect:eq(0)").attr('y'));

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x+5);
    line.setAttribute("x2", x+10);            // mesma coordenada X para ser vertical
    line.setAttribute("y1", y);
    line.setAttribute("y2", y + 3000);     // Y final = Y inicial + altura
    line.setAttribute("stroke", "red");    // cor
    line.setAttribute("stroke-width", "2");

    document.querySelector('svg').appendChild(line);
}
function moveTitleToTop() {
    let titulos = $('text',$('svg g')[1]);
    titulos.attr('y',20)
}

google.charts.load('current', { 'packages': ['gantt'] });
google.charts.setOnLoadCallback(drawGanttChart);


