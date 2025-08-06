const lcjs = require('@lightningchart/lcjs')
const { createProgressiveTraceGenerator } = require('@lightningchart/xydata')
const { lightningChart, AxisPosition, Themes, AxisTickStrategies, synchronizeAxisIntervals } = lcjs

let channels = [{ name: 'Channel 1' }, { name: 'Channel 2' }, { name: 'Channel 3' }]

const exampleContainer = document.getElementById('chart') || document.body
const container = document.createElement('div')
exampleContainer.append(container)
container.style.height = '200vh'
container.style.width = '100%'

const lc = lightningChart({
            resourcesBaseUrl: new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'resources/',
        })
const chart = lc
    .ChartXY({
        container,
        legend: { visible: false },
        defaultAxisX: { type: 'linear-highPrecision' },
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined,
    })
    .setTitle('')
    .setPadding({ top: 0 })
    // Improves cursor visibility in use cases with HTML overlays between stacked axes
    .setCursor((cursor) => cursor.setKeepWithinAxisBoundaries(true))

const isDarkTheme = chart.getTheme().isDark

chart.axisY.dispose()
chart.axisX.setTickStrategy(AxisTickStrategies.DateTime)

const createChannel = (info) => {
    const axisY = chart.addAxisY({ iStack: -chart.getAxes(AxisPosition.Left).length })
    const series = chart.addPointLineAreaSeries({ axisY }).setCurvePreprocessing({ type: 'spline' }).setName(info.name)
    createProgressiveTraceGenerator()
        .setNumberOfPoints(1000)
        .generate()
        .toPromise()
        .then((data) => {
            series.appendJSON(data, { start: performance.timeOrigin, step: 60 * 1000 })
        })

    // HTML header UI that displays channel name and allows modifying the channel.
    const headerDiv = document.createElement('div')
    chart.engine.container.append(headerDiv)
    headerDiv.style.display = 'flex'
    headerDiv.style.alignItems = 'center'
    headerDiv.style.justifyContent = 'space-between'
    headerDiv.style.padding = '.2rem'
    headerDiv.style.border = `1px solid ${isDarkTheme ? 'white' : 'black'}`
    headerDiv.style.position = 'absolute'
    headerDiv.style.backgroundColor = isDarkTheme ? 'black' : 'white'
    headerDiv.style.fontFamily = 'Segoe UI'
    headerDiv.style.width = '100%'
    headerDiv.style.boxSizing = 'border-box'

    const channelText = document.createElement('span')
    headerDiv.appendChild(channelText)
    channelText.textContent = info.name
    channelText.style.flexGrow = '1'

    const moveUpButton = document.createElement('button')
    headerDiv.appendChild(moveUpButton)
    moveUpButton.textContent = 'Up'
    moveUpButton.style.background = 'transparent'
    moveUpButton.style.border = 'none'
    moveUpButton.style.color = 'inherit'
    moveUpButton.onclick = () => {
        const axes = chart.getAxes(AxisPosition.Left)
        const i = axes.indexOf(axisY)
        const axisAbove = axes[i + 1]
        if (!axisAbove) return
        chart.swapAxes(axisAbove, axisY)
    }

    const moveDownButton = document.createElement('button')
    headerDiv.appendChild(moveDownButton)
    moveDownButton.textContent = 'Down'
    moveDownButton.style.background = 'transparent'
    moveDownButton.style.border = 'none'
    moveDownButton.style.color = 'inherit'
    moveDownButton.onclick = () => {
        const axes = chart.getAxes(AxisPosition.Left)
        const i = axes.indexOf(axisY)
        const axisBelow = axes[i - 1]
        if (!axisBelow) return
        chart.swapAxes(axisBelow, axisY)
    }

    const deleteButton = document.createElement('button')
    headerDiv.appendChild(deleteButton)
    deleteButton.textContent = 'Delete'
    deleteButton.style.background = 'transparent'
    deleteButton.style.border = 'none'
    deleteButton.style.color = 'inherit'
    deleteButton.onclick = () => {
        axisY.dispose()
        const i = channels.indexOf(ch)
        channels.splice(i, 1)
        headerDiv.remove()
    }

    // Positioning logic between Chart with stacked axes and HTML overlays.
    // 1) Positioning of HTML is done using LCJS events that inform when axis layout changes.
    const handleLayoutChange = (event) => {
        const position = event.axes.get(axisY)
        if (!position) return
        headerDiv.style.top = `${position.top}px`
        headerDiv.style.transform = 'translateY(-100%)'
        // 2) Allocate space between Y axes of the chart, based on the size of the HTML UI.
        axisY.setMargins(0, headerDiv.getBoundingClientRect().height)
        event.userChangedLayout()
    }
    chart.addEventListener('layoutchange', handleLayoutChange)
    // Automatically destroy chart event listener if axis (channel) is removed to not keep references.
    axisY.addEventListener('dispose', () => chart.removeEventListener('layoutchange', handleLayoutChange))

    const ch = { ...info, axisY, series }
    return ch
}

channels = channels.map(createChannel)

const addChButton = document.createElement('button')
chart.engine.container.append(addChButton)
addChButton.textContent = 'Add channel'
addChButton.style.background = 'transparent'
addChButton.style.border = 'none'
addChButton.style.color = 'inherit'
addChButton.style.position = 'absolute'
addChButton.style.bottom = '0px'
addChButton.style.left = '0px'
addChButton.onclick = () => {
    channels.push(createChannel({ name: `Channel ${channels.length + 1}` }))
}

chart.engine.container.style.color = isDarkTheme ? 'white' : 'black'

// Sticky X axis
// this is achieved with a second overlay ChartXY that only consists of an X axis that is synchronized and aligned with the main X axis.
// this overlay is only visible when the main X axis is not in view.
const stickyXContainer = document.createElement('div')
document.body.append(stickyXContainer)
stickyXContainer.style.position = 'fixed'
stickyXContainer.style.transform = 'translateY(-100%)'
const stickyXChart = lc
    .ChartXY({ container: stickyXContainer, defaultAxisX: { type: 'linear-highPrecision' } })
    .setPadding({ top: 0, bottom: 0 })
    .setTitle('')
stickyXChart.addEventListener('layoutchange', (event) => {
    stickyXContainer.style.height = `${event.axes.get(stickyXChart.axisX).height + 1}px`
    event.userChangedLayout()
})
chart.addEventListener('layoutchange', (event) => {
    stickyXContainer.style.width = `${event.chartWidth}px`
    stickyXChart.setPadding({ left: event.margins.left, right: event.margins.right })
    stickyXChart.engine.layout()
})
synchronizeAxisIntervals(chart.axisX, stickyXChart.axisX)
stickyXChart.axisX.setTickStrategy(AxisTickStrategies.DateTime)
stickyXChart.axisY.dispose()
// Hide sticky axis when it is not needed. NOTE: This part of code may have to be implemented differently based on application.
const scrollChanged = () => {
    const scrollTop = exampleContainer === document.body ? window.scrollY : exampleContainer.scrollTop
    const stickyAxisVisible = Math.abs(scrollTop + exampleContainer.clientHeight - exampleContainer.scrollHeight) > 5
    stickyXContainer.style.display = stickyAxisVisible ? 'block' : 'none'
    const chartBounds = exampleContainer.getBoundingClientRect()
    stickyXContainer.style.left = `${chartBounds.left}px`
    stickyXContainer.style.top = `${chartBounds.bottom}px`
    stickyXChart.engine.layout()
}
exampleContainer.onscroll = scrollChanged
window.onscroll = scrollChanged
