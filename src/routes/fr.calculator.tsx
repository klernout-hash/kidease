import { createFileRoute } from "@tanstack/react-router";
import { CalculatorPage, calculatorHead } from "@/routes/calculator";

export const Route = createFileRoute("/fr/calculator")({
  head: () => calculatorHead("fr"),
  component: CalculatorPage,
});
