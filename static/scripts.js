let map;
let selectedLat = null;
let selectedLng = null;
let markers = {}; // Store markers by bin ID

function initMap() {
    // Initialize the Google map
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 44.66534095035757, lng: -63.62137517790954 },
        zoom: 15
    });

    // REMOVED any call to `refreshBins()` here to avoid auto-loading all markers on page load.

    // If user clicks on the map, prompt to add a new bin
    map.addListener('click', function(e) {
        if (confirm("Do you want to add a bin at this location?")) {
            selectedLat = e.latLng.lat();
            selectedLng = e.latLng.lng();

            // Place a temporary marker so user sees where they clicked
            new google.maps.Marker({
                position: { lat: selectedLat, lng: selectedLng },
                map: map,
                animation: google.maps.Animation.DROP
            });
        }
    });

    // Handle the "Add Bin" form submission
    document.getElementById("binForm").onsubmit = function(event) {
        event.preventDefault();

        if (selectedLat === null || selectedLng === null) {
            alert("Click on the map to select a bin location first.");
            return;
        }

        let note = document.getElementById("note").value;
        let image = document.getElementById("image").files[0];
        let route = document.getElementById("routeSelect").value;

        // Validate route is selected
        if (!route) {
            alert("Please select a route before saving a bin.");
            return;
        }

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
                // After adding the bin, refresh the markers for the currently selected route
                refreshBins();
                // Reset the selectedLat/selectedLng
                selectedLat = null;
                selectedLng = null;
                // Clear the form fields
                document.getElementById("note").value = "";
                document.getElementById("image").value = "";
            })
            .catch(error => console.error("Error adding bin:", error));
    };
}

// Only fetch and display bins for the currently selected route
function refreshBins() {
    let route = document.getElementById("routeSelect").value;

    // If no route is selected, optionally clear existing markers and do nothing
    if (!route) {
        // Clear existing markers
        for (let id in markers) {
            markers[id].setMap(null);
        }
        markers = {};
        return;
    }

    // Build URL with the selected route
    let url = `/get_bins?route=${route}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log("Fetched bins:", data);

            // Remove old markers from the map
            for (let id in markers) {
                markers[id].setMap(null);
            }
            markers = {};

            // Add new markers for the selected route
            data.forEach(bin => {
                let marker = new google.maps.Marker({
                    position: { lat: bin.lat, lng: bin.lng },
                    map: map
                });

                // Build info window content
                let infowindow = new google.maps.InfoWindow({
                    content: `
                        <b>${bin.note}</b><br>
                        <b>Route:</b> ${bin.route}<br>
                        ${
                            bin.image 
                            ? `<img src="${bin.image}" width="100"><br>` 
                            : ""
                        }
                        <button onclick="deleteBin(${bin.id})">Delete</button>
                        <button onclick="editBin(${bin.id}, '${bin.note}')">Edit</button>
                    `
                });

                marker.addListener('click', function() {
                    infowindow.open(map, marker);
                });

                markers[bin.id] = marker;
            });
        })
        .catch(error => console.error("Error fetching bins:", error));
}

// Delete a bin by ID
function deleteBin(binId) {
    if (!binId) return;
    if (!confirm("Are you sure you want to delete this bin?")) return;

    fetch(`/delete_bin/${binId}`, { method: "DELETE" })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            // Remove the deleted bin's marker from the map
            if (markers[binId]) {
                markers[binId].setMap(null);
                delete markers[binId];
            }
        })
        .catch(error => console.error("Error deleting bin:", error));
}

// Edit a bin's note (and optionally image) by ID
function editBin(binId, oldNote) {
    let newNote = prompt("Enter new note:", oldNote);
    if (newNote === null) return;

    let formData = new FormData();
    formData.append("note", newNote);

    // Ask if user wants to update the image
    if (confirm("Do you want to update the image?")) {
        let imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.accept = "image/*";

        imageInput.onchange = function() {
            if (imageInput.files.length > 0) {
                formData.append("image", imageInput.files[0]);
            }
            updateBin(binId, formData);
        };
        imageInput.click();
    } else {
        updateBin(binId, formData);
    }
}

// Helper to update bin on the server
function updateBin(binId, formData) {
    fetch(`/edit_bin/${binId}`, { method: "POST", body: formData })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            // Refresh markers for the current route
            refreshBins();
        })
        .catch(error => console.error("Error updating bin:", error));
}

// Initialize the map once the page has loaded
window.onload = initMap;
