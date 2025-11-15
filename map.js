// Import D3 as ES module
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Step 1.3: Set your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3ViaG95YSIsImEiOiJjbWh6eTl4N3gwczVtMm1vc3FxNW9memMxIn0.uhExl0jAlzM8pYQKmoTJ5A';

// Step 1.3: Initialize map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0589, 42.3601], // Boston coordinates
  zoom: 12
});

// Global variables
let stations = [];
let trips = [];
let departuresByMinute = [];
let arrivalsByMinute = [];
let svg;
let sizeScale;
let stationFlow;

// Step 2.1: Wait for map to load before adding data
map.on('load', async () => {
  // Step 2: Add bike lanes
  await addBikeLanes();
  
  // Step 3.1: Fetch and parse CSV
  await loadStationsAndTraffic();
  
  // Step 3.2: Set up SVG overlay
  setupSVGOverlay();
  
  // Step 5.4: Process trips by minute
  processTripsByMinute();
  
  // Step 4: Initial visualization
  updateScatterPlot(-1);
  
  // Step 5: Set up time filter
  setupTimeFilter();
});

// Step 2: Add bike lanes from GeoJSON
async function addBikeLanes() {
  const response = await fetch('Existing_Bike_Network_2022.geojson');
  const bikeNetwork = await response.json();
  
  map.addSource('bike-lanes', {
    type: 'geojson',
    data: bikeNetwork
  });
  
  // Step 2.2: Styling
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'bike-lanes',
    paint: {
      'line-color': '#4CAF50',
      'line-width': 3,
      'line-opacity': 0.7
    }
  });
}

// Step 3.1 & 4.1: Fetch stations and parse CSV
async function loadStationsAndTraffic() {
  // Fetch station data from BlueBikes API
  const stationsResponse = await fetch('https://gbfs.bluebikes.com/gbfs/en/station_information.json');
  const stationsData = await stationsResponse.json();
  stations = stationsData.data.stations;
  
  // Parse CSV traffic data
  const csvResponse = await fetch('bluebikes-traffic-2024-03.csv');
  const csvText = await csvResponse.text();
  trips = d3.csvParse(csvText);
}

// Step 5.4: Process trips by minute for efficient filtering
function processTripsByMinute() {
  departuresByMinute = Array(1440).fill(null).map(() => []);
  trips.forEach(trip => {
    const startTime = new Date(trip.started_at);
    if (!isNaN(startTime.getTime())) {
      const minutes = startTime.getHours() * 60 + startTime.getMinutes();
      if (minutes >= 0 && minutes < 1440) {
        departuresByMinute[minutes].push(trip);
      }
    }
  });
  
  arrivalsByMinute = Array(1440).fill(null).map(() => []);
  trips.forEach(trip => {
    const endTime = new Date(trip.ended_at);
    if (!isNaN(endTime.getTime())) {
      const minutes = endTime.getHours() * 60 + endTime.getMinutes();
      if (minutes >= 0 && minutes < 1440) {
        arrivalsByMinute[minutes].push(trip);
      }
    }
  });
}

// Step 5.4: Filter trips by time range efficiently
function filterByMinute(tripsByMinute, timeFilter) {
  if (timeFilter === -1) {
    return tripsByMinute.flat();
  }
  
  const [minMinute, maxMinute] = timeFilter;
  
  if (minMinute > maxMinute) {
    const beforeMidnight = tripsByMinute.slice(minMinute);
    const afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// Step 4.2: Calculate traffic at each station
function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    // Match using short_name (CSV uses short_name like "A32010")
    const stationId = station.short_name || station.station_id.toString();
    const departuresCount = departures.get(stationId) || 0;
    const arrivalsCount = arrivals.get(stationId) || 0;
    const totalTraffic = departuresCount + arrivalsCount;
    
    return {
      ...station,
      departures: departuresCount,
      arrivals: arrivalsCount,
      totalTraffic: totalTraffic
    };
  });
}

// Step 3.2: Set up SVG overlay on the map
function setupSVGOverlay() {
  const mapContainer = d3.select('#map');
  const width = mapContainer.node().offsetWidth;
  const height = mapContainer.node().offsetHeight;
  
  svg = mapContainer
    .append('svg')
    .attr('width', width)
    .attr('height', height);
}

// Step 3.3 & 4: Update scatter plot with station markers
function updateScatterPlot(timeFilter) {
  if (!svg || !stations || stations.length === 0) {
    return;
  }
  
  const stationsWithTraffic = computeStationTraffic(stations, timeFilter);
  
  // Step 4.3: Update size scale
  const maxTraffic = d3.max(stationsWithTraffic, d => d.totalTraffic) || 1;
  sizeScale = d3.scaleSqrt()
    .domain([0, maxTraffic])
    .range([3, 20]);
  
  // Step 6.1: Update flow scale
  stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);
  
  // Step 3.3: Bind data to circles
  const circles = svg
    .selectAll('circle')
    .data(stationsWithTraffic, d => d.station_id);
  
  circles.exit().remove();
  
  const circlesEnter = circles.enter()
    .append('circle')
    .on('mouseenter', function(event, d) {
      // Step 4.4: Show tooltip
      const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);
      
      tooltip.html(`
        <strong>${d.name}</strong><br/>
        Departures: ${d.departures}<br/>
        Arrivals: ${d.arrivals}<br/>
        Total: ${d.totalTraffic}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .transition()
        .duration(200)
        .style('opacity', 1);
      
      d3.select(this).style('stroke', 'white').style('stroke-width', 2);
    })
    .on('mousemove', function(event) {
      d3.select('.tooltip')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseleave', function() {
      d3.select('.tooltip').remove();
      d3.select(this).style('stroke', null).style('stroke-width', null);
    });
  
  circles.merge(circlesEnter)
    .attr('cx', d => {
      // Convert to number and validate
      if (d.lon == null || d.lat == null) return -1000;
      const lng = Number(d.lon);
      const lat = Number(d.lat);
      if (isNaN(lng) || isNaN(lat)) return -1000;
      
      const point = map.project([lng, lat]);
      if (!point || isNaN(point.x)) return -1000;
      return point.x;
    })
    .attr('cy', d => {
      // Convert to number and validate
      if (d.lon == null || d.lat == null) return -1000;
      const lng = Number(d.lon);
      const lat = Number(d.lat);
      if (isNaN(lng) || isNaN(lat)) return -1000;
      
      const point = map.project([lng, lat]);
      if (!point || isNaN(point.y)) return -1000;
      return point.y;
    })
    .attr('r', d => {
      // Step 4.3: Size by traffic
      return d.totalTraffic > 0 ? sizeScale(d.totalTraffic) : 3;
    })
    .style('--departure-ratio', d => {
      // Step 6.1: Set departure ratio for color
      if (d.totalTraffic === 0) return 0.5;
      return stationFlow(d.departures / d.totalTraffic);
    });
}

// Update circle positions when map moves
function updateCirclePositions() {
  if (!svg) return;
  
  svg.selectAll('circle')
    .attr('cx', d => {
      if (d.lon == null || d.lat == null) return -1000;
      const lng = Number(d.lon);
      const lat = Number(d.lat);
      if (isNaN(lng) || isNaN(lat)) return -1000;
      
      const point = map.project([lng, lat]);
      if (!point || isNaN(point.x)) return -1000;
      return point.x;
    })
    .attr('cy', d => {
      if (d.lon == null || d.lat == null) return -1000;
      const lng = Number(d.lon);
      const lat = Number(d.lat);
      if (isNaN(lng) || isNaN(lat)) return -1000;
      
      const point = map.project([lng, lat]);
      if (!point || isNaN(point.y)) return -1000;
      return point.y;
    });
}

// Step 5: Set up time filter slider
function setupTimeFilter() {
  const slider = d3.select('#time-slider');
  
  const initialValue = +slider.property('value');
  const initialHours = Math.floor(initialValue / 60);
  const initialMinutes = initialValue % 60;
  d3.select('#time-display').text(
    `${String(initialHours).padStart(2, '0')}:${String(initialMinutes).padStart(2, '0')}`
  );
  
  // Step 5.2: Reactivity
  slider.on('input', function() {
    const value = +this.value;
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    d3.select('#time-display').text(
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    );
    
    // Step 5.3: Filter with 2-hour window
    const windowSize = 120;
    const minMinute = (value - windowSize / 2 + 1440) % 1440;
    const maxMinute = (value + windowSize / 2) % 1440;
    
    updateScatterPlot([minMinute, maxMinute]);
  });
}

// Update SVG and circles on map interactions
map.on('move', () => {
  if (svg) {
    const mapContainer = d3.select('#map');
    svg.attr('width', mapContainer.node().offsetWidth)
       .attr('height', mapContainer.node().offsetHeight);
  }
  updateCirclePositions();
});

map.on('zoom', () => {
  if (svg) {
    const mapContainer = d3.select('#map');
    svg.attr('width', mapContainer.node().offsetWidth)
       .attr('height', mapContainer.node().offsetHeight);
  }
  updateCirclePositions();
});

map.on('resize', () => {
  if (svg) {
    const mapContainer = d3.select('#map');
    svg.attr('width', mapContainer.node().offsetWidth)
       .attr('height', mapContainer.node().offsetHeight);
  }
  updateCirclePositions();
});

