// Set your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3ViaG95YSIsImEiOiJjbWh6eTl4N3gwczVtMm1vc3FxNW9memMxIn0.uhExl0jAlzM8pYQKmoTJ5A';

// Initialize map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0589, 42.3601], // Boston coordinates
  zoom: 12
});

// Wait for map to load
map.on('load', () => {
  console.log('Map loaded successfully');
  // Add bike lanes and stations here
});

