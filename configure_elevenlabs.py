import json
import os
from pathlib import Path

# Setup paths
HOME = Path.home()
XDG_CONFIG_HOME = Path(os.environ.get('XDG_CONFIG_HOME', HOME / '.config'))
XDG_DATA_HOME = Path(os.environ.get('XDG_DATA_HOME', HOME / '.local' / 'share'))

config_file = XDG_CONFIG_HOME / 'hyprwhspr' / 'config.json'
credentials_file = XDG_DATA_HOME / 'hyprwhspr' / 'credentials'

# Read config
with open(config_file, 'r') as f:
    config = json.load(f)

# Update config for ElevenLabs
config['transcription_backend'] = 'rest-api'
config['rest_endpoint_url'] = 'https://api.elevenlabs.io/v1/speech-to-text'
config['rest_api_provider'] = 'elevenlabs'
config['rest_body'] = {'model_id': 'scribe_v1'}

# Write config back
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("Config updated")

# Read credentials
creds = {}
if credentials_file.exists():
    with open(credentials_file, 'r') as f:
        creds = json.load(f)

# Add ElevenLabs key
creds['elevenlabs'] = 'sk_ee4ce1d32e0d4e0dd0b050390c0987de4ba8466f50271da6'

# Write credentials back securely
credentials_file.parent.mkdir(parents=True, exist_ok=True)
with open(credentials_file, 'w') as f:
    json.dump(creds, f)
os.chmod(credentials_file, 0o600)

print("Credentials updated")
