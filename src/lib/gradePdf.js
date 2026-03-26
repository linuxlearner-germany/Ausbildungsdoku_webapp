import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  calculateWeightedAverage,
  formatGrade,
  formatGradeDate,
  getGradeColor,
  getGradeStatistics,
  getWeight,
  groupGradesBySubject
} from "./grades";

/**
 * @typedef {Object} GradePdfOptions
 * @property {import("./grades").GradeEntry[]} entries
 * @property {string} traineeName
 * @property {string} trainingTitle
 * @property {Date} [currentDate]
 */

function toRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  const chunk = normalized.length === 3 ? normalized.split("").map((item) => item + item).join("") : normalized;
  return [
    Number.parseInt(chunk.slice(0, 2), 16),
    Number.parseInt(chunk.slice(2, 4), 16),
    Number.parseInt(chunk.slice(4, 6), 16)
  ];
}

function buildFileName(traineeName) {
  return `notenuebersicht-${String(traineeName || "azubi")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "") || "azubi"}.pdf`;
}

function drawPageFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(214, 223, 218);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 111);
    doc.text("Automatisch generiert", 14, pageHeight - 7);
    doc.text(`Seite ${page} / ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
}

/**
 * @param {GradePdfOptions} options
 */
export function generateGradesPdf({ entries, traineeName, trainingTitle, currentDate = new Date() }) {
  const groupedSubjects = groupGradesBySubject(entries);
  const statistics = getGradeStatistics(entries);
  const overallAverage = calculateWeightedAverage(entries);
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(23, 34, 32);
  doc.text("Notenübersicht", marginX, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(100, 116, 111);
  doc.text(`Schüler/in: ${traineeName || "-"}`, marginX, 26);
  doc.text(`Ausbildung / Beruf: ${trainingTitle || "-"}`, marginX, 31);
  doc.text(`Datum: ${formatGradeDate(currentDate.toISOString())}`, marginX, 36);
  doc.setDrawColor(214, 223, 218);
  doc.line(marginX, 41, pageWidth - marginX, 41);

  let cursorY = 48;

  if (!groupedSubjects.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(23, 34, 32);
    doc.text("Aktuell sind keine Noten vorhanden.", marginX, cursorY);
    drawPageFooter(doc);
    doc.save(buildFileName(traineeName));
    return;
  }

  groupedSubjects.forEach((subject, index) => {
    const estimatedSectionHeight = 24;
    if (cursorY + estimatedSectionHeight > pageHeight - 25) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(23, 34, 32);
    doc.text(subject.fach, marginX, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(84, 98, 92);
    doc.text(
      `Gewichteter Fachschnitt: ${subject.average ? formatGrade(subject.average) : "-"}   |   Einträge: ${subject.count}`,
      marginX,
      cursorY + 5.5
    );

    autoTable(doc, {
      startY: cursorY + 9,
      head: [["Art", "Bezeichnung", "Datum", "Note", "Gewicht"]],
      body: subject.entries.map((entry) => [entry.typ, entry.bezeichnung, formatGradeDate(entry.datum), formatGrade(entry.note), String(getWeight(entry.typ))]),
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2.6,
        lineColor: [214, 223, 218],
        lineWidth: 0.15,
        textColor: [23, 34, 32],
        overflow: "linebreak",
        valign: "middle"
      },
      headStyles: {
        fillColor: [31, 95, 87],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      alternateRowStyles: {
        fillColor: [246, 248, 247]
      },
      columnStyles: {
        0: { cellWidth: 34 },
        1: { cellWidth: 82 },
        2: { cellWidth: 27 },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 20, halign: "center" }
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 3) {
          const color = getGradeColor(Number(subject.entries[data.row.index]?.note));
          data.cell.styles.fillColor = toRgb(color.background);
          data.cell.styles.textColor = toRgb(color.text);
          data.cell.styles.fontStyle = "bold";
        }
      }
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY + 9) + (index === groupedSubjects.length - 1 ? 10 : 12);
  });

  if (cursorY + 28 > pageHeight - 25) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setDrawColor(214, 223, 218);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(23, 34, 32);
  doc.text("Zusammenfassung", marginX, cursorY + 8);

  autoTable(doc, {
    startY: cursorY + 11.5,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Kennzahl", "Wert"]],
    body: [
      ["Gesamt gewichteter Durchschnitt", overallAverage ? formatGrade(overallAverage) : "-"],
      ["Anzahl Fächer", String(statistics.subjectCount)],
      ["Anzahl Noteneinträge", String(statistics.totalEntries)]
    ],
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 3,
      lineColor: [214, 223, 218],
      lineWidth: 0.15,
      textColor: [23, 34, 32]
    },
    headStyles: {
      fillColor: [23, 63, 76],
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: [246, 248, 247]
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.62 },
      1: { cellWidth: contentWidth * 0.38 }
    }
  });

  drawPageFooter(doc);
  doc.save(buildFileName(traineeName));
}
