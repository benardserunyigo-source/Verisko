import importlib.util
import pathlib
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location("agent", pathlib.Path(__file__).with_name("watch-agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class AgentTests(unittest.TestCase):
    def test_reachable_device(self):
        with patch.object(agent.socket, "create_connection", return_value=MagicMock()):
            result = agent.check_device({"kind": "camera", "label": "Test", "ip": "192.168.1.21", "port": 554})
            self.assertTrue(result["ok"])
            self.assertNotIn("ip", result)

    def test_failed_device(self):
        with patch.object(agent.socket, "create_connection", side_effect=OSError()):
            self.assertFalse(agent.check_device({"kind": "camera", "label": "Test", "ip": "192.168.1.21", "port": 554})["ok"])


if __name__ == "__main__":
    unittest.main()
