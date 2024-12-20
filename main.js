let map;
let appState = {
    user: null,
    markers: null,
    latLng: null,
    radius: null,
    heading: null,
	time: null,
	trip_id: null,
    points: null,
    color_points: null,
    lastPoint: null,
    pointHistory: null,
    currentZoom: 8,
    isTracking: false,
    loadingPaths: false,
    coolDown: false,
    mean_ri: null,
};

let wfs = 'https://baug-ikg-gis-01.ethz.ch:8443/geoserver/GTA24_lab06/wfs';
let wms = 'https://baug-ikg-gis-01.ethz.ch:8443/geoserver/GTA24_lab06/wms';
let app_url = 'https://gta-project-group-2.vercel.app/';
let timer = null;

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

function calculateCityRi() {
    // Berechnet den RI-Wert für alle Trips
    return fetch(`${app_url}city_ri`, { method: "GET" }) // Return the fetch Promise
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Fehler beim Berechnen des Stadt-RI:", data.error);
                return;
            }
            console.log("Stadt-RI in calculateCityRI berechnet:", data);
            document.getElementById("city_value").innerText = data.ri.toFixed(2);
        })
        .catch(error => {
            console.error("Fehler beim Berechnen des Stadt-RI:", error);
        });
}

/**
 * The onload function is called when the HTML has finished loading.
 */
function onload() {

    // Check if the user is using Safari
    let isSafari =  /safari/i.test(navigator.userAgent) &&
                    /version/i.test(navigator.userAgent) &&
                    !/chrome|android|crios|fxios/i.test(navigator.userAgent);
    if (isSafari) {
        alert("You are using Safari. Some features may not work as expected.");
    }

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

    map = L.map('map').setView([47.38035, 8.52265], 12);
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

	$("#start").click(startTracking);
    $("#allPaths").click(showAllPaths);
    $("#end").click(stopTracking).hide();
    $("#mean_ri").hide();
    $(".legend").hide();

    // Authentifizierung
    document.getElementById("show-register").addEventListener("click", function(event) {
        event.preventDefault();
        document.querySelectorAll(".auth-form")[0].style.display = "none";
        document.querySelectorAll(".auth-form")[1].style.display = "block";
    });

    document.getElementById("show-login").addEventListener("click", function(event) {
        event.preventDefault();
        document.querySelectorAll(".auth-form")[1].style.display = "none";
        document.querySelectorAll(".auth-form")[0].style.display = "block";
    });

    console.log("App geladen");

    calculateCityRi().then(() => {
        console.log("Stadt-RI berechnet");
    });
}

function getColorByRI(riValue) {
    if (riValue < 10) return [255, 0, 0];        // Dunkelrot
    if (riValue < 20) return [255, 69, 0];       // Helles Rot-Orange
    if (riValue < 30) return [255, 140, 0];      // Dunkel-Orange
    if (riValue < 40) return [255, 165, 0];      // Orange
    if (riValue < 50) return [255, 215, 0];      // Goldgelb
    if (riValue < 60) return [255, 255, 0];      // Gelb
    if (riValue < 70) return [173, 255, 47];     // Gelbgrün
    if (riValue < 80) return [0, 128, 0];        // Grün
    if (riValue < 90) return [0, 191, 255];      // Himmelblau
    if (riValue < 100) return [0, 0, 255];       // Blau
    if (riValue == 100) return [75, 0, 130];     // Indigo (für Werte = 100)
}

function interpolateColor(rgb1, rgb2, factor) {
    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));

    return `rgb(${r}, ${g}, ${b})`; // Gibt die interpolierte Farbe als RGB-String zurück
}

function drawColoredLine() {
    if (appState.pointHistory.length < 2) {
        return; 
    }

    console.log("Zeichne farbige Linie", appState.pointHistory);

    map.removeLayer(appState.points); 
    appState.points.clearLayers();   
    map.addLayer(appState.points);

    for (let i = 0; i < appState.pointHistory.length - 1; i++) {
        let currentPoint = appState.pointHistory[i];
        let nextPoint = appState.pointHistory[i + 1];

        let currentColor = getColorByRI(currentPoint.ri_value || 5);
        let nextColor = getColorByRI(nextPoint.ri_value || 5);

        // Anzahl der Segmente für die Interpolation
        let segments = 10;

        let segmentLatLngs = [];
        for (let j = 0; j <= segments; j++) {
            let factor = j / segments; // Interpolationsfaktor
            let lat = currentPoint.lat + factor * (nextPoint.lat - currentPoint.lat);
            let lng = currentPoint.lng + factor * (nextPoint.lng - currentPoint.lng);
            segmentLatLngs.push([lat, lng]);

            if (j > 0) {
                let color = interpolateColor(currentColor, nextColor, factor);

                // Zeichne die Linie für diesen Abschnitt
                let segmentLine = L.polyline(
                    [segmentLatLngs[j - 1], segmentLatLngs[j]],
                    { color: color, weight: 5, opacity: 0.8 }
                );
                appState.color_points.addLayer(segmentLine);
            }
        }
    }

    map.addLayer(appState.color_points);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString(); // Konvertiert in ISO 8601 Format: yyyy-MM-ddTHH:mm:ss.sssZ
}

// INSERT point
// REF: https://github.com/Georepublic/leaflet-wfs/blob/master/index.html#L201
function insertPoint(lat, lng, time, trip_id, ri_value, noise, tree_count, pollution) {
    return new Promise((resolve, reject) => {
    console.log("Inserting point:", lat, lng, time, trip_id, ri_value, noise, tree_count, pollution);
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
                      <tree_count>${tree_count}</tree_count>
                      <pollution_value>${pollution}</pollution_value>
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
			console.log("Success from AJAX, data sent to Geoserver");

            let point = L.circleMarker([lat, lng], {
                radius: 2,
                color: "black",
                fillColor: "black",
                fillOpacity: 0.8
            }).bindPopup(`Trip ID: ${trip_id}<br>RI Value: ${ri_value}<br>Time: ${time}`);
            appState.points.addLayer(point);

           // Zeichnet schwarze Linie zwischen den Punkten
           if (appState.lastPoint) {
            let lastPoint = appState.lastPoint;
            let latLngs = [
                [lastPoint.lat, lastPoint.lng],  // Letzter Punkt
                [lat, lng]                       // Neuer Punkt
            ];

            L.polyline(latLngs, { color: 'black' }).addTo(appState.points);
        }

        // Den aktuellen Punkt zur Historie hinzufügen
        appState.lastPoint = { lat: lat, lng: lng, ri_value: ri_value };
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

    // Abrufen der höchsten Trip-ID
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

    if (appState.isTracking) {
        return;
    }

    // Cooldown aktivieren
    appState.coolDown = true;

    // Cooldown von 3 Sekunden setzen
    setTimeout(() => {
        appState.coolDown = false;
    }, 3000);
    
    // Verstecke den "Start"-Button und zeige den "End"-Button und die "mean_ri"-Anzeige
    $("#start").hide();
    $("#allPaths").hide(); 
    $("#end").show();  
    $("#mean_ri").hide();
    $(".legend").hide();

    console.log("Start tracking", appState.user);
    user_id = appState.user[0];

    // Abrufen der nächsten Trip-ID
    fetchHighestTripId(function (nextTripId) {
        appState.trip_id = nextTripId; // Nächste aufsteigende Trip-ID

        // Trip in der Datenbank anlegen
        fetch(`${app_url}insert_trip?user_id=${user_id}&trip_id=${appState.trip_id}`, { method: "GET" })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error("Fehler beim Anlegen des Trips:", data.error);
                    alert("Fehler, bitte Trip neu starten")
                    return;
                }
                console.log("Trip erfolgreich angelegt:", data);
            })
            .catch(error => {
                console.error("Fehler beim Anlegen des Trips:", error);
            });

           
        if (!appState.latLng) {
            // Fehlernachricht anzeigen
            let errMsg = $("#error-messages"); // Stelle sicher, dass dieses Element existiert
            errMsg.text("Bitte warten Sie, bis Ihre Position geladen wurde.");
            errMsg.show();
            return; //  Funktion abbrechen
        }
        
        if (map && appState.latLng) {
            map.setView(appState.latLng, 15); 
        }

        appState.isTracking = true;
        appState.color_points.clearLayers();
        
        get_ri(appState.latLng) // hier RI-Wert berechnen
        .then(values => {

            insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2], values[3]);

            if (timer) {
                clearInterval(timer);
                }

            timer = setInterval(() => {
                if (appState.latLng && appState.time) {
                    
                    get_ri(appState.latLng) // hier RI-Wert berechnen
                    .then(values => {
                        console.log("RI-Werte:", values);
                        insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2], values[3]);
                    });
                }
            }, 8000);  // Alle 8 Sekunden

        
        });
    });
}

// Tracking stop
function stopTracking() {

    if (appState.coolDown) {
        console.log("Cooldown aktiv, bitte warten...");
        return;
    }


    $("#start").show(); // Zeigt den "Start"-Button
    $("#allPaths").show();
    $("#end").hide(); 
    $(".legend").show();

    get_ri(appState.latLng) // hier RI-Wert berechnen
    .then(values => {
    // Letzten Punkt einfügen und nach Abschluss die Linie zeichnen
        insertPoint(appState.latLng.lat, appState.latLng.lng, appState.time, appState.trip_id, values[0], values[1], values[2], values[3])
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
                    appState.lastPoint = null;
                    appState.pointHistory = data.points;
                    console.log('points:', appState.pointHistory)
                    drawColoredLine();

                    // Berechnung des Mittelwertes für den aktuellen Pfad
                    if (appState.pointHistory.length > 0) {
                        let mean_ri = appState.pointHistory.reduce((sum, point) => sum + (point.ri_value || 0), 0) / appState.pointHistory.length;
                        appState.mean_ri = mean_ri
                        console.log("Berechneter mean_ri:", mean_ri); 
                        $("#mean_ri_value").text(mean_ri.toFixed(2));
                    } else {
                        $("#mean_ri_value").text("N/A");
                    }

                    // Aktualisieren des mean_ri in der Datenbank
                    fetch(`${app_url}update_mean_ri`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            trip_id: appState.trip_id,
                            mean_ri: appState.mean_ri
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            console.error("Fehler beim Aktualisieren von mean_ri:", data.error);
                        } else {
                            console.log("mean_ri erfolgreich aktualisiert:", data);
                        }
                    })
                    .catch(error => {
                        console.error("Fehler beim Aktualisieren von mean_ri:", error);
                    });
                    
                    $("#mean_ri").show();
                    
                    appState.mean_ri = null;
                    })

                                
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
    console.log("RI-Wert:", data.ri, data.noise, data.trees, data.pollution);
    return [data.ri, data.noise, data.trees, data.pollution];
}

function login() {
    // Verhindert Probleme, falls der Benutzer mehrmals auf den Login-Button klickt
    if (appState.isLoggingIn) {
        return;
    }
    appState.isLoggingIn = true;
    setTimeout(() => {
        appState.isLoggingIn = false;
    }, 3000);

    // Benutzername und Passwort aus den Eingabefeldern abrufen
    let username = document.getElementById("login-username").value;
    let password = hashPassword(document.getElementById("login-password").value);

    // Anfrage an den Server senden, einen Benutzer mit den angegebenen Anmeldeinformationen zu finden
    fetch(`${app_url}login?username=${username}&password=${password}`, {
        method: "GET",
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error("Fehler beim Einloggen:", data.error);
            return;
        }

        // Benutzer erfolgreich eingeloggt
        console.log("Erfolgreich eingeloggt:", data);
        appState.user = data;

        // Eingabefelder leeren und Authentifizierungscontainer ausblenden
        document.getElementById("login-username").value = "";
        document.getElementById("login-password").value = "";

        document.getElementById("auth-container").style.display = "none";
    })

}

function register() {
    // Verhindert Probleme, falls der Benutzer mehrmals auf den Registrierungs-Button klickt
    if (appState.isRegistering) {
        return;
    }
    appState.isRegistering = true;
    setTimeout(() => {
        appState.isRegistering = false;
    }, 3000);

    // Benutzername und Passwort aus den Eingabefeldern abrufen
    let username = document.getElementById("register-username").value;
    let password = hashPassword(document.getElementById("register-password").value);

    // Anfrage an den Server senden, um einen neuen Benutzer mit den angegebenen Registrierungsinformationen zu erstellen
    fetch(`${app_url}register?username=${username}&password=${password}`, {
        method: "GET",
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error("Fehler beim Registrieren:", data.error);
            return;
        }
        // Benutzer erfolgreich registriert

        console.log("Erfolgreich registriert:", data);
        appState.user = data.user;

        // Eingabefelder leeren und Authentifizierungscontainer ausblenden
        document.getElementById("register-username").value = "";
        document.getElementById("register-password").value = "";

        document.getElementById("auth-container").style.display = "none";
    })
}

async function showAllPaths() {
    // Falls der Benutzer bereits auf den Button geklickt hat, wird er deaktiviert
    if (appState.loadingPaths) {
        return;
    }

    // Wenn der Button geklickt wird, werden alle Pfade angezeigt, wenn nochmal geklickt wird, werden sie ausgeblendet
    allPathsButton = document.getElementById("allPaths");

    if (allPathsButton.classList.contains("clicked")) {
        allPathsButton.classList.remove("clicked");
        appState.color_points.clearLayers();
        appState.points.clearLayers();
        $("#mean_ri").hide();
        $(".legend").hide();
        return;
    }
    allPathsButton.classList.add("clicked")
    console.log("showAllPaths wird ausgeführt...");

    appState.loadingPaths = true;

    // Alle Pfade des users abrufen
    const response = await fetch(`${app_url}get_trips?user_id=${appState.user[0]}`, { method: "GET" });
    const trip_ids = await response.json();

    if (trip_ids.error) {
        console.error("Fehler beim Abrufen aller Pfade:", trip_ids.error);
        return;
    }
    console.log("Alle Pfade abgerufen:", trip_ids);

    // Alle Pfade zeichnen
    let mean_RIs = [];

    for (let i = 0; i < trip_ids.length; i++) {
        // Alle Punkte für den aktuellen Pfad abrufen
        const response = await fetch(`${wfs}?service=WFS&version=1.0.0&request=GetFeature&typeName=GTA24_lab06:webapp_trajectory_point&outputFormat=application/json&cql_filter=trip_id=${trip_ids[i]}`, { method: "GET" })
        const data = await response.json();
        let paths = {};

        // Punkte in Pfade gruppieren
        data.features.forEach(feature => {
            let trip_id = feature.properties.trip_id;
            if (!paths[trip_id]) {
                paths[trip_id] = [];
            }
            paths[trip_id].push({
                lat: feature.geometry.coordinates[1],
                lng: feature.geometry.coordinates[0],
                ri_value: feature.properties.ri_value  
            });
        });

        // Pfade zeichnen
        Object.keys(paths).forEach(trip_id => {
            appState.pointHistory = paths[trip_id];
            drawColoredLine();

            // Berechnung des Mittelwertes für den aktuellen Pfad
            if (appState.pointHistory.length > 0) {
                let mean_ri = appState.pointHistory.reduce((sum, point) => sum + (point.ri_value || 0), 0) / appState.pointHistory.length;
                mean_RIs.push(mean_ri);
                $("#mean_ri_value").text(mean_ri.toFixed(2));
                $("#mean_ri").show();
            } else {
                mean_RIs.push(null);
            }
        });
    }
    
    // Berechnung des Mittelwertes für alle Pfade
    let mean_ri = mean_RIs.reduce((sum, ri) => sum + ri || 0, 0) / mean_RIs.length;
    $("#mean_ri_value").text(mean_ri.toFixed(2));
    $("#mean_text").text('Mean RI');
    $("#mean_ri").show();
    $(".legend").show();

    appState.loadingPaths = false;
}

function hashPassword(password) {
    // Einfache Hash-Funktion für das Passwort zur übertragung
    let hash = 0;
    if (password.length === 0) return hash.toString();
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
}

function toggleTooltip() {
    // Zeigt oder versteckt das Tooltip-Element
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
        tooltip.classList.toggle('visible');
    }
}

function closeTooltip() {
    // Versteckt das Tooltip-Element
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
}

