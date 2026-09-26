"""Small raster-expr/1 oracle for conformance fixtures; never evaluates Python code."""
from __future__ import annotations

import math
import re

TOKEN = re.compile(r"[ \t\r\n]+|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[A-Za-z_][A-Za-z_0-9]*|<=|>=|==|!=|[+*/(),;<>-]")
ARITY = {"abs": 1, "min": 2, "max": 2, "clamp": 3, "sqrt": 1, "log": 1, "exp": 1, "pow": 2, "where": 3}
PRECEDENCE = {"<": 5, "<=": 5, ">": 5, ">=": 5, "==": 5, "!=": 5, "+": 10, "-": 10, "*": 20, "/": 20}


class ExpressionError(ValueError):
    pass


class Parser:
    def __init__(self, text: str):
        self.tokens = []
        offset = 0
        while offset < len(text):
            match = TOKEN.match(text, offset)
            if match is None:
                raise ExpressionError("Unsupported token")
            token = match.group()
            if token.strip(" \t\r\n"):
                self.tokens.append(token)
            offset = match.end()
        self.tokens.append("")
        self.pos = 0

    def take(self, expected=None):
        token = self.tokens[self.pos]
        if not token or (expected is not None and token != expected):
            raise ExpressionError("Unexpected token")
        self.pos += 1
        return token

    def expression(self, minimum=0):
        token = self.take()
        if token in ("+", "-"):
            node = ("unary" + token, [self.expression(30)])
        elif token == "(":
            node = self.expression()
            self.take(")")
        elif token in ARITY:
            self.take("(")
            args = [self.expression()]
            while self.tokens[self.pos] == ",":
                self.take(",")
                args.append(self.expression())
            self.take(")")
            if len(args) != ARITY[token]:
                raise ExpressionError("Wrong arity")
            node = (token, args)
        elif re.fullmatch(r"b[1-9][0-9]*", token):
            if int(token[1:]) > 65535:
                raise ExpressionError("Band out of range")
            node = ("band", token)
        elif token[0].isdigit():
            value = float(token)
            if not math.isfinite(value):
                raise ExpressionError("Non-finite literal")
            node = ("number", value)
        else:
            raise ExpressionError("Unknown identifier")
        while PRECEDENCE.get(self.tokens[self.pos], -1) >= minimum:
            op = self.take()
            node = (op, [node, self.expression(PRECEDENCE[op] + 1)])
        return node


def node_type(node):
    op, args = node
    if op in ("number", "band"):
        return "number"
    types = [node_type(arg) for arg in args]
    if op == "where":
        if types != ["boolean", "number", "number"]:
            raise ExpressionError("Invalid where types")
    elif any(kind != "number" for kind in types):
        raise ExpressionError("Expected numeric operands")
    return "boolean" if PRECEDENCE.get(op) == 5 else "number"


def compile_expression(text):
    parts = text.split(";")
    if not 1 <= len(parts) <= 3 or any(not 1 <= len(p.strip(" \t\r\n")) <= 2048 for p in parts):
        raise ExpressionError("Invalid output length/count")
    parser = Parser(text)
    outputs = [parser.expression()]
    while parser.tokens[parser.pos] == ";":
        parser.take(";")
        outputs.append(parser.expression())
    if parser.tokens[parser.pos] or any(node_type(node) != "number" for node in outputs):
        raise ExpressionError("Invalid numeric output")
    return outputs


def dependencies(node):
    if node[0] == "band":
        return {node[1]}
    if node[0] == "number":
        return set()
    return set().union(*(dependencies(arg) for arg in node[1]))


def evaluate(node, bands):
    op, args = node
    if op == "number":
        return args
    if op == "band":
        return bands[args]
    if op == "where":
        condition = evaluate(args[0], bands)
        return None if condition is None else evaluate(args[1 if condition else 2], bands)
    values = [evaluate(arg, bands) for arg in args]
    if any(value is None for value in values):
        return None
    a = values[0]
    b = values[1] if len(values) > 1 else 0
    try:
        if op in ("+", "-", "*", "/"):
            result = {"+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b, "/": lambda: a / b}[op]()
        elif PRECEDENCE.get(op) == 5:
            return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "==": a == b, "!=": a != b}[op]
        elif op == "unary+":
            result = a
        elif op == "unary-":
            result = -a
        elif op == "clamp":
            if b > values[2]:
                return None
            result = min(max(a, b), values[2])
        else:
            result = {"abs": abs, "min": min, "max": max, "sqrt": math.sqrt, "log": math.log, "exp": math.exp, "pow": math.pow}[op](*values)
        return result if math.isfinite(result) else None
    except (ValueError, ZeroDivisionError, OverflowError):
        return None


def run_expression(text, bands):
    bands = {key: float(value) if value is not None and math.isfinite(float(value)) else None for key, value in bands.items()}
    nodes = compile_expression(text)
    required = set().union(*(dependencies(node) for node in nodes))
    if not required <= bands.keys():
        raise ExpressionError("Unbound band, including an unselected branch")
    return [evaluate(node, bands) for node in nodes]
