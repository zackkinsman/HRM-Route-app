from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_from_directory
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import hashlib
import os
from werkzeug.utils import secure_filename
from flask_migrate import Migrate
import secrets
from flask_migrate import upgrade

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Use a fixed secret key from environment or generate one if not set
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))

# Database configuration - Use PostgreSQL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = '/opt/render/project/uploads'

# Initialize database
db = SQLAlchemy()
migrate = Migrate()

db.init_app(app)
migrate.init_app(app, db)

# Ensure upload folder exists
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])



# Allowed image types
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Models
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(64), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)

class Bin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    note = db.Column(db.String(255), nullable=True)
    image_filename = db.Column(db.String(255), nullable=True)
    route = db.Column(db.String(50), nullable=True)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Flask-Limiter for brute-force protection
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)

# Routes
@app.route("/")
@limiter.limit("10000 per month")
def home():
    return redirect(url_for("completed_map"))

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        print(f"Error serving file: {e}")
        return "File not found", 404


@app.route("/completed_map")
def completed_map():
    google_maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    return render_template("completed_map.html", google_maps_api_key=google_maps_api_key)


@app.route("/add_bin", methods=["POST"])
@login_required
def add_bin():
    try:
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)
        note = request.form.get("note")
        route = request.form.get("route")

        if not lat or not lng:
            return jsonify({"message": "Invalid location data"}), 400

        image = request.files.get("image")
        image_filename = None

        if image and allowed_file(image.filename):
            filename = secure_filename(image.filename)
            
            # Ensure unique filename
            base_name, ext = os.path.splitext(filename)
            counter = 1
            while os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
                filename = f"{base_name}_{counter}{ext}"
                counter += 1

            image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            image.save(image_path)

            image_filename = filename

        # Save bin entry
        bin_entry = Bin(lat=lat, lng=lng, note=note, image_filename=image_filename, route=route)
        db.session.add(bin_entry)
        db.session.commit()

        return jsonify({"message": "Bin location saved!"})
    except Exception as e:
        print(f"Error saving bin: {e}")
        return jsonify({"message": "Error saving bin"}), 500


@app.route("/get_bins")
@limiter.limit("10000 per month")
def get_bins():
    route = request.args.get("route")
    bins = Bin.query.filter_by(route=route).all() if route else Bin.query.all()
    bin_list = [{
        "id": b.id,
        "lat": b.lat,
        "lng": b.lng,
        "note": b.note,
        "image": url_for("uploaded_file", filename=b.image_filename, _external=True) if b.image_filename else "",
        "route": b.route
    } for b in bins]
    return jsonify(bin_list)


@app.route("/optimize_route")
@limiter.limit("10000 per month")
def optimize_route():
    try:
        route = request.args.get("route")
        bins = Bin.query.filter_by(route=route).all() if route else Bin.query.all()

        if not bins:
            return jsonify({"message": "No bins found for the selected route."}), 404

        # Get user's current location from the request
        user_lat = float(request.args.get("user_lat"))
        user_lng = float(request.args.get("user_lng"))

        user_location = {"lat": user_lat, "lng": user_lng}
        bin_locations = [{"lat": b.lat, "lng": b.lng} for b in bins]

        # Find the closest bin to user's location
        closest_bin = min(bin_locations, key=lambda b: get_distance(user_location, b))

        # Arrange waypoints (excluding closest bin which is the first stop)
        waypoints = [b for b in bin_locations if b != closest_bin]

        # Return optimized route data
        return jsonify({
            "start": user_location,
            "first_stop": closest_bin,
            "waypoints": waypoints
        })
    except Exception as e:
        print(f"Error optimizing route: {e}")
        return jsonify({"message": "Error optimizing route"}), 500

def get_distance(p1, p2):
    from math import radians, sin, cos, sqrt, atan2
    R = 6371 
    dlat = radians(p2["lat"] - p1["lat"])
    dlon = radians(p2["lng"] - p1["lng"])
    a = sin(dlat/2) ** 2 + cos(radians(p1["lat"])) * cos(radians(p2["lat"])) * sin(dlon/2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


@app.route("/delete_bin/<int:bin_id>", methods=["DELETE"])
@login_required
def delete_bin(bin_id):
    bin_entry = Bin.query.get(bin_id)
    if not bin_entry:
        return jsonify({"message": "Bin not found"}), 404
    if bin_entry.image_filename:
        image_path = os.path.join(app.config["UPLOAD_FOLDER"], bin_entry.image_filename)
        if os.path.exists(image_path):
            os.remove(image_path)
    db.session.delete(bin_entry)
    db.session.commit()
    return jsonify({"message": "Bin deleted successfully"})

@app.route("/login", methods=["GET", "POST"])
@limiter.limit("5 per minute")
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        # Hash the entered password
        password_hash = hashlib.sha256(password.encode()).hexdigest()

        # Query the user
        user = User.query.filter_by(username=username, password_hash=password_hash).first()

        if user:
            login_user(user)
            return redirect(url_for("map"))
        else:
            flash("Invalid credentials. Try again.")
    
    return render_template("login.html")



@app.route("/edit_bin/<int:bin_id>", methods=["POST"])
@login_required
def edit_bin(bin_id):
    try:
        bin_entry = Bin.query.get(bin_id)
        if not bin_entry:
            return jsonify({"message": "Bin not found"}), 404

        note = request.form.get("note")
        if note:
            bin_entry.note = note

        image = request.files.get("image")
        if image and allowed_file(image.filename):
            if bin_entry.image_filename:
                old_image_path = os.path.join(app.config['UPLOAD_FOLDER'], bin_entry.image_filename)
                if os.path.exists(old_image_path):
                    os.remove(old_image_path)
            
            image_filename = secure_filename(image.filename)
            image.save(os.path.join(app.config['UPLOAD_FOLDER'], image_filename))
            bin_entry.image_filename = image_filename

        db.session.commit()
        return jsonify({"message": "Bin updated successfully!"})
    except Exception as e:
        print(f"Error updating bin: {e}")
        return jsonify({"message": "Error updating bin"}), 500


@app.route("/map")
@login_required
@limiter.limit("10000 per month")
def map():
    google_maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    return render_template("map.html", google_maps_api_key=google_maps_api_key)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))


if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])


if __name__ != "__main__":
    gunicorn_app = app


with app.app_context():
    try:
        upgrade()
        print("Database migrations applied successfully!")
    except Exception as e:
        print(f"Error applying migrations: {e}")