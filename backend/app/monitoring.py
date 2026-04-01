from threading import Lock
from time import perf_counter


_lock = Lock()
_request_count = 0
_request_duration_seconds = 0.0
_task_run_counts: dict[str, int] = {}
_task_item_counts: dict[tuple[str, str], int] = {}


def record_request(duration_seconds: float) -> None:
    global _request_count, _request_duration_seconds
    with _lock:
        _request_count += 1
        _request_duration_seconds += duration_seconds


def record_task_run(task_name: str, count: int = 1) -> None:
    with _lock:
        _task_run_counts[task_name] = _task_run_counts.get(task_name, 0) + count


def record_task_items(task_name: str, result_name: str, count: int) -> None:
    with _lock:
        key = (task_name, result_name)
        _task_item_counts[key] = _task_item_counts.get(key, 0) + count


def render_metrics() -> str:
    with _lock:
        lines = [
            "# HELP studio_http_requests_total Total HTTP requests served",
            "# TYPE studio_http_requests_total counter",
            f"studio_http_requests_total {_request_count}",
            "# HELP studio_http_request_duration_seconds_total Total HTTP request duration in seconds",
            "# TYPE studio_http_request_duration_seconds_total counter",
            f"studio_http_request_duration_seconds_total {_request_duration_seconds:.6f}",
        ]
        lines.extend(
            [
                "# HELP studio_task_runs_total Total task executions",
                "# TYPE studio_task_runs_total counter",
            ]
        )
        for task_name, count in sorted(_task_run_counts.items()):
            lines.append(f'studio_task_runs_total{{task="{task_name}"}} {count}')
        lines.extend(
            [
                "# HELP studio_task_items_total Total task items processed by result type",
                "# TYPE studio_task_items_total counter",
            ]
        )
        for (task_name, result_name), count in sorted(_task_item_counts.items()):
            lines.append(
                f'studio_task_items_total{{task="{task_name}",result="{result_name}"}} {count}'
            )
    return "\n".join(lines) + "\n"


def time_request():
    return perf_counter()
