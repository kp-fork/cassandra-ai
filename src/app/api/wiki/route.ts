import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const WIKI_PATH = path.join(process.cwd(), "Dart_Data", "persons-wiki.json");

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(WIKI_PATH, "utf-8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ persons: [] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, field, value } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const data = JSON.parse(fs.readFileSync(WIKI_PATH, "utf-8"));
    const person = data.persons?.find((p: any) => p.name === name);
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    if (field && value) {
      if (field === "context") person.context = value;
      else if (field === "comment") {
        person.comments = person.comments || [];
        person.comments.push({ text: value, date: new Date().toISOString() });
      }
    }

    fs.writeFileSync(WIKI_PATH, JSON.stringify(data, null, 2), "utf-8");
    return NextResponse.json({ success: true, person });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
