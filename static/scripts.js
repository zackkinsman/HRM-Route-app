// ------------------ Global Variables ------------------
// Admin (map.html) variables
let adminMap, adminSelectedLat = null, adminSelectedLng = null, adminMarkers = {};

// Completed Map (completed_map.html) variables
let completedMap, directionsService, directionsRenderer;
let completedMarkers = []; // For completed map markers (array)
let userLocation = null;

// ------------------ Global initMap ------------------
// This function is called by the Google Maps API callback.
// It checks for a unique element (like the bin form) to decide which page's functionality to load.
window.initMap = function() {
  if (document.getElementById("binForm")) {
    // We're on the admin page.
    initAdminMap();
  } else {
    // Otherwise, assume the completed routes map page.
    initCompletedMap();
  }
};

// ------------------ Admin Map Functions ------------------
function initAdminMap() {
  adminMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 44.66534095035757, lng: -63.62137517790954 },
    zoom: 15
  });

  // When user clicks on the map, ask if they want to add a bin
  adminMap.addListener('click', function(e) {
    if (confirm("Do you want to add a bin at this location?")) {
      adminSelectedLat = e.latLng.lat();
      adminSelectedLng = e.latLng.lng();
      new google.maps.Marker({
        position: { lat: adminSelectedLat, lng: adminSelectedLng },
        map: adminMap,
        animation: google.maps.Animation.DROP
      });
    }
  });

  // Handle bin form submission
  document.getElementById("binForm").onsubmit = function(event) {
    event.preventDefault();
    if (adminSelectedLat === null || adminSelectedLng === null) {
      alert("Click on the map to select a bin location first.");
      return;
    }
    let note = document.getElementById("note").value;
    let image = document.getElementById("image").files[0];
    let route = document.getElementById("routeSelect").value;
    if (!route) {
      alert("Please select a route before saving a bin.");
      return;
    }
    let formData = new FormData();
    formData.append("lat", adminSelectedLat);
    formData.append("lng", adminSelectedLng);
    formData.append("note", note);
    formData.append("image", image);
    formData.append("route", route);

    fetch("/add_bin", { method: "POST", body: formData })
      .then(response => response.json())
      .then(data => {
        alert(data.message);
        refreshAdminBins();
        adminSelectedLat = null;
        adminSelectedLng = null;
        document.getElementById("note").value = "";
        document.getElementById("image").value = "";
      })
      .catch(error => console.error("Error adding bin:", error));
  };
}

function refreshAdminBins() {
  let route = document.getElementById("routeSelect").value;
  if (!route) {
    // Clear markers if no route is selected
    for (let id in adminMarkers) {
      adminMarkers[id].setMap(null);
    }
    adminMarkers = {};
    return;
  }
  let url = `/get_bins?route=${route}`;
  fetch(url)
    .then(response => response.json())
    .then(data => {
      // Remove old markers
      for (let id in adminMarkers) {
        adminMarkers[id].setMap(null);
      }
      adminMarkers = {};
      // Add new markers for this route
      data.forEach(bin => {
        let marker = new google.maps.Marker({
          position: { lat: bin.lat, lng: bin.lng },
          map: adminMap
        });
        let infowindow = new google.maps.InfoWindow({
          content: `<b>${bin.note}</b><br>
                    <b>Route:</b> ${bin.route}<br>
                    ${bin.image ? `<img src="${bin.image}" width="100"><br>` : ""}
                    <button onclick="deleteBin(${bin.id})">Delete</button>
                    <button onclick="editBin(${bin.id}, '${bin.note}')">Edit</button>`
        });
        marker.addListener('click', function() {
          infowindow.open(adminMap, marker);
        });
        adminMarkers[bin.id] = marker;
      });
    })
    .catch(error => console.error("Error fetching bins:", error));
}

function deleteBin(binId) {
  if (!binId) return;
  if (!confirm("Are you sure you want to delete this bin?")) return;
  fetch(`/delete_bin/${binId}`, { method: "DELETE" })
    .then(response => response.json())
    .then(data => {
      alert(data.message);
      if (adminMarkers[binId]) {
        adminMarkers[binId].setMap(null);
        delete adminMarkers[binId];
      }
    })
    .catch(error => console.error("Error deleting bin:", error));
}

function editBin(binId, oldNote) {
  let newNote = prompt("Enter new note:", oldNote);
  if (newNote === null) return;
  let formData = new FormData();
  formData.append("note", newNote);
  // Ask if the user wants to update the image
  if (confirm("Do you want to update the image?")) {
    // Use a pre-existing hidden file input in the HTML
    let imageInput = document.getElementById("hiddenFileInput");
    imageInput.onchange = function() {
      if (imageInput.files.length > 0) {
        formData.append("image", imageInput.files[0]);
      }
      updateBin(binId, formData);
      imageInput.value = "";
    };
    imageInput.click();
  } else {
    updateBin(binId, formData);
  }
}

function updateBin(binId, formData) {
  fetch(`/edit_bin/${binId}`, { method: "POST", body: formData })
    .then(response => response.json())
    .then(data => {
      alert(data.message);
      refreshAdminBins();
    })
    .catch(error => console.error("Error updating bin:", error));
}

// ------------------ Completed Routes Map Functions ------------------
function initCompletedMap() {
  completedMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 44.66541324819608, lng: -63.62142899829352 },
    zoom: 15
  });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map: completedMap });
  promptForLocation();
}

function promptForLocation() {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      console.log("User granted location:", userLocation);
    },
    (error) => {
      alert("Location access denied. Using a default location.");
      userLocation = { lat: 44.66541324819608, lng: -63.62142899829352 };
      console.log("Using default location:", userLocation);
    }
  );
}

function refreshCompletedBins() {
  let route = document.getElementById("routeSelect").value;
  if (!route) {
    completedMarkers.forEach(marker => marker.setMap(null));
    completedMarkers = [];
    directionsRenderer.setDirections({ routes: [] });
    return;
  }
  let url = `/get_bins?route=${route}`;
  fetch(url)
    .then(response => response.json())
    .then(data => {
      // Clear existing markers
      completedMarkers.forEach(marker => marker.setMap(null));
      completedMarkers = [];
      let waypoints = [];
      let closestBin = null;
      let minDistance = Infinity;
      data.forEach(bin => {
        let binLocation = new google.maps.LatLng(bin.lat, bin.lng);
        let marker = new google.maps.Marker({
          position: binLocation,
          map: completedMap
        });
        let infowindow = new google.maps.InfoWindow({
          content: `<b>${bin.note}</b><br>
                    ${bin.image ? `<img src="${bin.image}" width="100"><br>` : ""}`
        });
        marker.addListener('click', () => infowindow.open(completedMap, marker));
        completedMarkers.push(marker);
        let distance = getDistance(userLocation, { lat: bin.lat, lng: bin.lng });
        if (distance < minDistance) {
          minDistance = distance;
          closestBin = bin;
        }
        waypoints.push({
          location: binLocation,
          stopover: true
        });
      });
      if (data.length > 0) {
        optimizeRoute(userLocation, waypoints, closestBin);
      } else {
        directionsRenderer.setDirections({ routes: [] });
      }
    })
    .catch(error => console.error("Error fetching bins:", error));
}

function getDistance(p1, p2) {
  let R = 6371; // Earth's radius in km
  let dLat = (p2.lat - p1.lat) * Math.PI / 180;
  let dLng = (p2.lng - p1.lng) * Math.PI / 180;
  let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function optimizeRoute(start, waypoints, firstStop) {
  if (!start || !firstStop) {
    console.error("No valid start or first stop for the route.");
    return;
  }
  let request = {
    origin: new google.maps.LatLng(start.lat, start.lng),
    destination: new google.maps.LatLng(firstStop.lat, firstStop.lng),
    waypoints: waypoints.map(wp => ({
      location: wp.location,
      stopover: true
    })),
    optimizeWaypoints: true,
    travelMode: google.maps.TravelMode.DRIVING
  };
  directionsService.route(request, function(result, status) {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setOptions({ suppressMarkers: true });
      directionsRenderer.setDirections(result);
    } else {
      console.error("Directions request failed due to " + status);
    }
  });
}
