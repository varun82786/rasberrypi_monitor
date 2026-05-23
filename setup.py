#!/usr/bin/env python3
"""
Setup script for Raspberry Pi Monitor Dashboard
Helps users configure the application quickly
"""

import os
import sys
import subprocess
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        print(f"Current version: {sys.version}")
        return False
    print(f"✅ Python version: {sys.version.split()[0]}")
    return True

def install_dependencies():
    """Install required Python packages"""
    print("\n📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def create_env_file():
    """Create .env file from template"""
    env_file = Path(".env")
    env_example = Path(".env.example")
    
    if env_file.exists():
        print("⚠️  .env file already exists")
        response = input("Do you want to overwrite it? (y/N): ")
        if response.lower() != 'y':
            print("Skipping .env file creation")
            return True
    
    if not env_example.exists():
        print("❌ .env.example file not found")
        return False
    
    try:
        # Copy template
        with open(env_example, 'r') as src, open(env_file, 'w') as dst:
            dst.write(src.read())
        
        print("✅ Created .env file from template")
        print("\n🔧 Please edit .env file with your ThingSpeak credentials:")
        print("   - THINGSPEAK_READ_API_KEY")
        print("   - THINGSPEAK_CHANNEL_ID")
        print("   - SECRET_KEY (for production)")
        return True
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")
        return False

def check_thingspeak_config():
    """Check if ThingSpeak configuration is set"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        api_key = os.getenv('THINGSPEAK_READ_API_KEY')
        channel_id = os.getenv('THINGSPEAK_CHANNEL_ID')
        
        if not api_key or api_key == 'H0USM137GRY8Y3IA':
            print("⚠️  Please set your THINGSPEAK_READ_API_KEY in .env file")
            return False
        
        if not channel_id or channel_id == '2662777':
            print("⚠️  Please set your THINGSPEAK_CHANNEL_ID in .env file")
            return False
        
        print("✅ ThingSpeak configuration looks good")
        return True
    except ImportError:
        print("⚠️  python-dotenv not installed, skipping config check")
        return True
    except Exception as e:
        print(f"⚠️  Could not check ThingSpeak config: {e}")
        return True

def run_application():
    """Start the Flask application"""
    print("\n🚀 Starting Raspberry Pi Monitor Dashboard...")
    print("📍 Dashboard will be available at: http://localhost:6060")
    print("🛑 Press Ctrl+C to stop the server")
    
    try:
        subprocess.run([sys.executable, "app.py"])
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
    except Exception as e:
        print(f"❌ Failed to start server: {e}")

def main():
    """Main setup function"""
    print("🔧 Raspberry Pi Monitor Dashboard Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Install dependencies
    if not install_dependencies():
        sys.exit(1)
    
    # Create .env file
    if not create_env_file():
        sys.exit(1)
    
    # Check configuration
    config_ok = check_thingspeak_config()
    
    print("\n" + "=" * 50)
    print("✅ Setup completed successfully!")
    
    if not config_ok:
        print("\n⚠️  Please configure your ThingSpeak credentials in .env file before running")
        print("Then run: python app.py")
    else:
        response = input("\nDo you want to start the dashboard now? (Y/n): ")
        if response.lower() != 'n':
            run_application()

if __name__ == "__main__":
    main()