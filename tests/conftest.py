"""
Pytest configuration for Licitometro tests.
"""

import sys
import os

# Ensure backend modules are importable from all test files
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
