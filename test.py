import sys
import time
import random

def stream_words(text, base_delay=0.12):
    words = text.split(" ")
    for word in words:
        sys.stdout.write(word + " ")
        sys.stdout.flush()

        # Natural variation
        delay = base_delay + random.uniform(0, 0.15)
        time.sleep(delay)

    print()

stream_words("Hello, this is your AI assistant speaking.")