import requests

url = "https://api.elevenlabs.io/v1/speech-to-text"
print(requests.options(url).status_code)
