let map;
let selectedLat = null;
let selectedLng = null;
let markers = {}; // Store markers by bin ID

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 44.66534095035757, lng: -63.62137517790954 },
        zoom: 15
    });

    refreshBins();

    map.addListener('click', function(e) {
        if (confirm("Do you want to add a bin at this location?")) {
            selectedLat = e.latLng.lat();
            selectedLng = e.latLng.lng();

            let tempMarker = new google.maps.Marker({
                position: { lat: selectedLat, lng: selectedLng },
                map: map,
                animation: google.maps.Animation.DROP
            });
        }
    });

    document.getElementById("binForm").onsubmit = function(event) {
        event.preventDefault();

        if (selectedLat === null || selectedLng === null) {
            alert("Click on the map to select a bin location first.");
            return;
        }

        let note = document.getElementById("note").value;
        let image = document.getElementById("image").files[0];
        let route = document.getElementById("routeSelect").value;

        let formData = new FormData();
        formData.append("lat", selectedLat);
        formData.append("lng", selectedLng);
        formData.append("note", note);
        formData.append("image", image);
        formData.append("route", route);

        fetch("/add_bin", { method: "POST", body: formData })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                refreshBins();
                selectedLat = null;
                selectedLng = null;
            });
    };
}

function saveTempBin(lat, lng, marker) {
    let note = document.getElementById("tempNote").value;
    let image = document.getElementById("tempImage").files[0];
    let route = document.getElementById("routeSelect").value;

    let formData = new FormData();
    formData.append("lat", lat);
    formData.append("lng", lng);
    formData.append("note", note);
    formData.append("image", image);
    formData.append("route", route);

    fetch("/add_bin", { method: "POST", body: formData })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            refreshBins();
            marker.setMap(null);

            let newMarker = new google.maps.Marker({
                position: { lat: lat, lng: lng },
                map: map
            });

            let infowindow = new google.maps.InfoWindow({
                content: `<b>${note}</b><br>
                          <b>Route:</b> ${route}<br>
                          ${image ? `<img src="${URL.createObjectURL(image)}" width="100"><br>` : ""}
                          <button onclick="deleteBin(${data.id})">Delete</button>
                          <button onclick="editBin(${data.id}, '${note}')">Edit</button>`
            });

            newMarker.addListener('click', function() {
                infowindow.open(map, newMarker);
            });

            infowindow.open(map, newMarker);
        });
}

function refreshBins() {
    let route = document.getElementById("routeSelect").value;
    let url = route ? `/get_bins?route=${route}` : "/get_bins";

    fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log("Fetched bins:", data);

            for (let id in markers) {
                markers[id].setMap(null);
            }
            markers = {};

            data.forEach(bin => {
                let marker = new google.maps.Marker({
                    position: { lat: bin.lat, lng: bin.lng },
                    map: map
                });

                let infowindow = new google.maps.InfoWindow({
                    content: `<b>${bin.note}</b><br>
                              <b>Route:</b> ${bin.route}<br>
                              ${bin.image ? `<img src="https://hrm-route-app.onrender.com${bin.image}" width="100"><br>` : ""}
                              <button onclick="deleteBin(${bin.id})">Delete</button>
                              <button onclick="editBin(${bin.id}, '${bin.note}')">Edit</button>`
                });

                marker.addListener('click', function() {
                    infowindow.open(map, marker);
                });

                markers[bin.id] = marker;
            });
        });
}

function deleteBin(binId) {
    if (!binId) return;

    if (!confirm("Are you sure you want to delete this bin?")) return;

    fetch(`/delete_bin/${binId}`, { method: "DELETE" })
        .then(response => response.json())
        .then(data => {
            alert(data.message);

            // Remove only the deleted bin marker from the map
            if (markers[binId]) {
                markers[binId].setMap(null);
                delete markers[binId];
            }
        })
        .catch(error => console.error("Error deleting bin:", error));
}

function editBin(binId, oldNote) {
    let newNote = prompt("Enter new note:", oldNote);
    if (newNote === null) return;

    let formData = new FormData();
    formData.append("note", newNote);

    if (confirm("Do you want to update the image?")) {
        let imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.accept = "image/*";

        imageInput.onchange = function() {
            if (imageInput.files.length > 0) {
                formData.append("image", imageInput.files[0]);

                fetch(`/edit_bin/${binId}`, { method: "POST", body: formData })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message);
                        refreshBins();
                    })
                    .catch(error => console.error("Error updating bin:", error));
            }
        };

        imageInput.click();
    } else {
        fetch(`/edit_bin/${binId}`, { method: "POST", body: formData })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                refreshBins();
            })
            .catch(error => console.error("Error updating bin:", error));
    }
}

window.onload = initMap;
