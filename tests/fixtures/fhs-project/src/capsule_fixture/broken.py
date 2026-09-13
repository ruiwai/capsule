def expects_text(value: str) -> str:
    return value


# Deliberate source diagnostic. Environment recovery must report, not repair it.
result: str = expects_text(42)
