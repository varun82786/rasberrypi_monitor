from datetime import datetime

def is_night():
    # Get the current time
    current_time = datetime.now().time()
    
    # Define night hours
    start_night = datetime.strptime("20:00", "%H:%M").time()  # 8:00 PM
    end_night = datetime.strptime("06:00", "%H:%M").time()    # 6:00 AM

    # Check if the current time is in the night range
    if current_time >= start_night or current_time <= end_night:
        return True
    else:
        return False