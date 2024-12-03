let map;
let appState = {
    markers: null,
    latLng: null,
    radius: null,
    heading: null,
	time: null,
	trip_id: null,
    points: null,
    color_points: null,
    pointHistory: [],
    currentZoom: 8,
    isTracking: false,
};


let wfs = 'https://baug-ikg-gis-01.ethz.ch:8443/geoserver/GTA24_lab06/wfs';
let app_url = 'https://gta-project-group-2.vercel.app/';
let timer = null;


function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString(); // Konvertiert in ISO 8601 Format: yyyy-MM-ddTHH:mm:ss.sssZ
}


function drawMarkers() {
    if (map && appState.markers && appState.latLng && appState.radius) {
        appState.markers.clearLayers();
        let circle = L.circle(appState.latLng, {
            radius: appState.radius
        });
        appState.markers.addLayer(circle);

        if (appState.heading !== null) {
			let radius = circle.getBounds().getCenter().lat - circle.getBounds().getSouth();
            let startPointLat = appState.latLng.lat - radius * Math.cos(appState.heading);
            let startPointLng = appState.latLng.lng - radius * Math.sin(appState.heading);
            let endPointLat = appState.latLng.lat - radius * 3 * Math.cos(appState.heading);
            let endPointLng = appState.latLng.lng - radius * 3 * Math.sin(appState.heading);

            let LatLngsHeading = [
                [startPointLat, startPointLng],
                [endPointLat, endPointLng]
            ];
            appState.markers.addLayer(L.polyline(LatLngsHeading, {color: 'rgb(255, 0, 0)'}));
        }
    }
}

/**
 * Function to be called whenever a new position is available.
 * @param position The new position.
 */
function geoSuccess(position) {
    let lat = position.coords.latitude;
    let lng = position.coords.longitude;
    appState.latLng = L.latLng(lat, lng);
    appState.radius = position.coords.accuracy / 2;
    appState.time = formatTime(Date.now());
    drawMarkers();

    // Nur die Karte aktualisieren, wenn das Tracking aktiv ist
    if (appState.isTracking && map) {
        map.setView(appState.latLng, appState.currentZoom); 
    }
}

/**
 * Function to be called if there is an error raised by the Geolocation API.
 * @param error Describing the error in more detail.
 */
function geoError(error) {
    let errMsg = $("#error-messages");
    errMsg.text(errMsg.text() + "Fehler beim Abfragen der Position (" + error.code + "): " + error.message + " ");
    errMsg.show();
}

let geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 15000,  // The maximum age of a cached location (15 seconds).
    timeout: 12000   // A maximum of 12 seconds before timeout.
};

/**
 * The onload function is called when the HTML has finished loading.
 */
function onload() {
    let errMsg = $("#error-messages");

    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(geoSuccess, geoError, geoOptions);
    } else {
        errMsg.text(errMsg.text() + "Geolocation is leider auf diesem Gerät nicht verfügbar. ");
        errMsg.show();
    }

	if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', function (eventData) {
            appState.heading = eventData.alpha * (Math.PI / 180);
            drawMarkers();
        }, false);
    } else {
        errMsg.text(errMsg.text() + "DeviceOrientation ist leider nicht verfügbar. ");
        errMsg.show();
    }

    map = L.map('map').setView([46.82, 8.22], 8);
    appState.markers = L.layerGroup();
    appState.points = L.layerGroup();
    appState.color_points = L.layerGroup(); 

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    map.addLayer(appState.markers);
    map.addLayer(appState.points);
    map.addLayer(appState.color_points); 

    map.on('zoomend', function () {
        appState.currentZoom = map.getZoom(); // Aktuellen Zoom speichern
    });

	// Button-Event-Handler registrieren
	$("#start").click(startTracking);
    $("#end").click(stopTracking).hide(); // End-Button zu Beginn verstecken
    $("#mean_ri").hide();
}

function getColorByRI(riValue) {
    if (riValue < 20) return [255, 0, 0];     // Rot
    if (riValue < 40) return [255, 165, 0];   // Orange
    if (riValue < 60) return [255, 255, 0];   // Gelb
    if (riValue < 80) return [0, 128, 0];     // Grün
    return [0, 0, 255];                      // Blau
}

function interpolateColor(rgb1, rgb2, factor) {
    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));

    return `rgb(${r}, ${g}, ${b})`; // Gib die interpolierte Farbe als RGB-String zurück
}

function drawColoredLine() {
    if (appState.pointHistory.length < 2) {
        return; // Es gibt keine Punkte, zwischen denen eine Linie gezeichnet werden kann
    }

    map.removeLayer(appState.points); 
    appState.points.clearLayers();   
    map.addLayer(appState.points); 


    for (let i = 0; i < appState.pointHistory.length - 1; i++) {
        let currentPoint = appState.pointHistory[i];
        let nextPoint = appState.pointHistory[i + 1];

        //console.log("RI Value:", currentPoint.ri_value);
        //console.log("RI Value:", nextPoint.ri_value);

        // Berechne Farben der Punkte als RGB-Werte
        let currentColor = getColorByRI(currentPoint.ri_value || 5);
        let nextColor = getColorByRI(nextPoint.ri_value || 5);

        //console.log("color:", currentColor);
        //console.log("color:", nextColor);

        // Anzahl der Segmente für die Interpolation (z.B. 10 für feineren Verlauf)
        let segments = 10;

        let segmentLatLngs = [];
        for (let j = 0; j <= segments; j++) {
            let factor = j / segments; // Interpolationsfaktor
            let lat = currentPoint.lat + factor * (nextPoint.lat - currentPoint.lat);
            let lng = currentPoint.lng + factor * (nextPoint.lng - currentPoint.lng);
            segmentLatLngs.push([lat, lng]);

            if (j > 0) {
                let color = interpolateColor(currentColor, nextColor, factor);
                //console.log("color:", color);

                // Zeichne die Linie für diesen Abschnitt
                let segmentLine = L.polyline(
                    [segmentLatLngs[j - 1], segmentLatLngs[j]],
                    { color: color, weight: 5, opacity: 0.8 }
                );
                appState.color_points.addLayer(segmentLine);
            }
        }

        // Markiere den Startpunkt mit seiner Farbe
        let startPointMarker = L.circleMarker([currentPoint.lat, currentPoint.lng], {
            radius: 2,
            color: currentColor,
            fillColor: currentColor,
            fillOpacity: 0.8
        }).bindPopup(`RI: ${currentPoint.ri_value}`);
        appState.color_points.addLayer(startPointMarker);


        // Markiere den Endpunkt (als separate Markierung oder Teil der nächsten Iteration)
        if (i === appState.pointHistory.length - 2) {
            let endPointMarker = L.circleMarker([nextPoint.lat, nextPoint.lng], {
                radius: 2,
                color: nextColor,
                fillColor: nextColor,
                fillOpacity: 0.8
            }).bindPopup(`RI: ${nextPoint.ri_value}`);
            appState.color_points.addLayer(endPointMarker);
        }
    }

    map.addLayer(appState.color_points); // Den Layer der Karte hinzufügen
}


// INSERT point
// REF: https://github.com/Georepublic/leaflet-wfs/blob/master/index.html#L201
function insertPoint(lat, lng, time, trip_id, ri_value, noise, distance) {
    return new Promise((resolve, reject) => {
    console.log("Inserting point:", lat, lng, time, trip_id, ri_value, noise, distance);
	let postData = `<wfs:Transaction
			  service="WFS"
			  version="1.0.0"
			  xmlns="http://www.opengis.net/wfs"
			  xmlns:wfs="http://www.opengis.net/wfs"
			  xmlns:gml="http://www.opengis.net/gml"
			  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
			  xmlns:GTA24_lab06="https://www.gis.ethz.ch/GTA24_lab06"
			  xsi:schemaLocation="
				  https://www.gis.ethz.ch/GTA24_lab06
				  https://baug-ikg-gis-01.ethz.ch:8443/geoserver/GTA24_lab06/wfs?service=WFS&amp;version=1.0.0&amp;request=DescribeFeatureType&amp;typeName=GTA24_lab06%3Awebapp_trajectory_point
				  http://www.opengis.net/wfs
				  https://baug-ikg-gis-01.ethz.ch:8443/geoserver/schemas/wfs/1.0.0/WFS-basic.xsd">
			  <wfs:Insert>
				  <GTA24_lab06:webapp_trajectory_point>
					  <point_id>101010101</point_id>
					  <trip_id>${trip_id}</trip_id>
					  <ri_value>${ri_value}</ri_value>
					  <time>${time}</time>
					  <geometry>
						  <gml:Point srsName="http://www.opengis.net/gml/srs/epsg.xml#4326">
							  <gml:coordinates xmlns:gml="http://www.opengis.net/gml" decimal="." cs="," ts=" ">${lng},${lat}</gml:coordinates>
						  </gml:Point>
					  </geometry>
                      <noise_value>${noise}</noise_value>
                      <tree_distance>${distance}</tree_distance>
				  </GTA24_lab06:webapp_trajectory_point>
			  </wfs:Insert>
		  </wfs:Transaction>`;
	
	$.ajax({
		method: "POST",
		url: wfs,
		dataType: "xml",
		contentType: "text/xml",
		data: postData,
		success: function() {	
			//Success feedback
			console.log("Success from AJAX, data sent to Geoserver");

            let point = L.circleMarker([lat, lng], {
                radius: 2,
                color: "black",
                fillColor: "black",
                fillOpacity: 0.8
            }).bindPopup(`Trip ID: ${trip_id}<br>RI Value: ${ri_value}<br>Time: ${time}`);
            appState.points.addLayer(point);

           // Zeichne schwarze Linie zwischen den Punkten
           if (appState.pointHistory.length > 0) {
            let lastPoint = appState.pointHistory[appState.pointHistory.length - 1];
            let latLngs = [
                [lastPoint.lat, lastPoint.lng],  // Letzter Punkt
                [lat, lng]                       // Neuer Punkt
            ];

            // Polyline (schwarze Linie) zwischen den Punkten
            let polyline = L.polyline(latLngs, { color: 'black' }).addTo(appState.points);
        }

        // Den aktuellen Punkt zur Historie hinzufügen
        appState.pointHistory.push({ lat: lat, lng: lng, ri_value: ri_value });
        resolve(); // Promise auflösen
    },

    error: function (xhr, errorThrown) {
        console.log("Error from AJAX");
        console.log(xhr.status);
        console.log(errorThrown);
        console.log("Response text: ", xhr.responseText);  
    }
});
});
}

function fetchHighestTripId(callback) {
    fetch(`${app_url}highest_trip_id`, { method: "GET" })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Fehler beim Abrufen der höchsten Trip-ID:", data.error);
                return;
            }
            callback(data[0][0] + 1); // Nächste aufsteigende Trip-ID
        })
        .catch(error => {
            console.error("Fehler beim Abrufen der höchsten Trip-ID:", error);
            callback(1); // Fallback auf 1, falls ein Fehler auftritt
        });
}


// Tracking start
function startTracking() {

    // Abrufen der nächsten Trip-ID
    fetchHighestTripId(function (nextTripId) {
        appState.trip_id = nextTripId; // Nächste aufsteigende Trip-ID

        appState.pointHistory = [];
        appState.isTracking = true;
    
        if (!appState.latLng) {
            // Fehlernachricht anzeigen
            let errMsg = $("#error-messages"); // Stelle sicher, dass dieses Element existiert
            errMsg.text("Bitte warten Sie, bis Ihre Position geladen wurde.");
            errMsg.show();
            return; //  Funktion abbrechen
        }
        
        if (map && appState.latLng) {
            map.setView(appState.latLng, 15); // Fokussiere und zoome auf Level 15
        }

        appState.color_points.clearLayers(); 

        get_ri(appState.latLng) // hier RI-Wert anpassen oder berechnen
        .then(values => {

            insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2]);

            if (timer) {
                clearInterval(timer);
                }

            timer = setInterval(() => {
                if (appState.latLng && appState.time) {
                    
                    get_ri(appState.latLng) // hier RI-Wert anpassen oder berechnen
                    .then(values => {
                        console.log("RI-Werte:", values);
                        insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2]);
                    });
                }
            }, 10000);  // Alle 10 Sekunden

            // Buttons umschalten
            $("#start").hide(); // Versteckt den "Start"-Button
            $("#end").show();   // Zeigt den "End"-Button
            $("#mean_ri").hide();

        });
    });
}

// Tracking stop
function stopTracking() {

    get_ri(appState.latLng) // hier RI-Wert anpassen oder berechnen
    .then(values => {
    // Letzten Punkt einfügen und nach Abschluss die Linie zeichnen
        insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2])
            .then(() => {

                //Get point history
                fetch(`${app_url}point_history?trip_id=${appState.trip_id}`, { method : "GET" })
                    .then(response => response.json())
                    .then(data => {
                        console.log("Punkte abgerufen:", data);
                        if (data.error) {
                            console.error("Fehler beim Abrufen der Punkte:", data.error);
                            return;
                        }
                        appState.pointHistory = data;
                    })

                // drawColoredLine erst nach erfolgreichem Insert aufrufen
                drawColoredLine();

                // Berechnung des Durchschnitts (mean_ri)
                if (appState.pointHistory.length > 0) {
                    let mean_ri = appState.pointHistory.reduce((sum, point) => sum + (point.ri_value || 0), 0) / appState.pointHistory.length;
                    $("#mean_ri_value").text(mean_ri.toFixed(2));
                } else {
                    $("#mean_ri_value").text("N/A");
                }

                // Buttons umschalten
                $("#start").show(); // Zeigt den "Start"-Button
                $("#end").hide();   // Versteckt den "End"-Button
                $("#mean_ri").show();
            })
            .catch(error => {
                console.error("Fehler beim Stop-Tracking:", error);
            });

        clearInterval(timer);
        timer = null;
        appState.isTracking = false;
    });
}

// Berechnung des RI-Wertes
async function get_ri(latlng) {
    let lat = latlng.lat;
    let lng = latlng.lng;
    // Hier RI-Wert anpassen oder berechnen
    const response = await fetch(`${app_url}calculate_ri?lat=${lat}&lng=${lng}`, { 
        method: "GET", 
    })
    const data = await response.json();

    if (data.error) {
        console.error("Fehler beim Berechnen des RI-Wertes:", data.error);
        return 7; // Fallback auf 7, falls ein Fehler auftritt
    }
    // Ändern
    console.log("RI-Wert:", data.ri, data.noise, data.distance);
    return [data.ri, data.noise, data.distance];
}