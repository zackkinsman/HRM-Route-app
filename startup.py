import subprocess

def start_server():
    subprocess.run(["python", "-m", "waitress", "--listen=0.0.0.0:8000", "app:app"])

if __name__ == "__main__":
    start_server()