package com.hayalnaft.attendance.util

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.Charset

/**
 * Minimal reader for the OLE2 compound file container used by old Office files (.xls, .doc).
 * Only reading named streams is supported, which is all the importers need.
 */
class CompoundFile(private val data: ByteArray) {
    private val buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
    private val sectorSize = 1 shl u16(0x1E)
    private val miniSectorSize = 1 shl u16(0x20)
    private val miniCutoff = i32(0x38)
    private val fat: IntArray
    private val miniFat: IntArray
    private val entries: List<Entry>
    private val miniStream: ByteArray

    private class Entry(val name: String, val type: Int, val start: Int, val size: Long)

    init {
        require(data.size >= 512 && i32(0) == 0xE011CFD0.toInt()) { "not a compound file" }
        // Sectors holding the FAT: the first 109 are listed in the header, the rest in DIFAT sectors.
        val fatSectors = mutableListOf<Int>()
        for (i in 0 until 109) {
            val s = i32(0x4C + i * 4)
            if (s >= 0) fatSectors.add(s)
        }
        var difat = i32(0x44)
        var guard = 0
        while (difat >= 0 && guard++ < 10_000) {
            val off = offset(difat)
            val per = sectorSize / 4 - 1
            for (i in 0 until per) {
                val s = i32(off + i * 4)
                if (s >= 0) fatSectors.add(s)
            }
            difat = i32(off + per * 4)
        }
        val fatList = ArrayList<Int>()
        for (s in fatSectors) {
            val off = offset(s)
            for (i in 0 until sectorSize / 4) fatList.add(i32(off + i * 4))
        }
        fat = fatList.toIntArray()

        val dir = chain(i32(0x30))
        entries = (0 until dir.size / 128).map { i ->
            val o = i * 128
            val nameLen = (dir[o + 0x40].toInt() and 0xFF) or ((dir[o + 0x41].toInt() and 0xFF) shl 8)
            val name = String(dir, o, maxOf(0, nameLen - 2), Charsets.UTF_16LE)
            val bb = ByteBuffer.wrap(dir, o, 128).order(ByteOrder.LITTLE_ENDIAN)
            Entry(name, dir[o + 0x42].toInt(), bb.getInt(o + 0x74), bb.getInt(o + 0x78).toLong() and 0xFFFFFFFFL)
        }
        val root = entries.firstOrNull { it.type == 5 }
        miniStream = root?.let { chain(it.start).copyOf(minOf(it.size, Int.MAX_VALUE.toLong()).toInt()) } ?: ByteArray(0)
        val mf = chain(i32(0x3C))
        miniFat = IntArray(mf.size / 4) { ByteBuffer.wrap(mf).order(ByteOrder.LITTLE_ENDIAN).getInt(it * 4) }
    }

    private fun u16(off: Int) = buf.getShort(off).toInt() and 0xFFFF
    private fun i32(off: Int) = buf.getInt(off)
    private fun offset(sector: Int) = (sector + 1) * sectorSize

    private fun chain(start: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        var s = start
        var guard = 0
        while (s >= 0 && s < fat.size && guard++ < 1_000_000) {
            val off = offset(s)
            if (off + sectorSize > data.size) break
            out.write(data, off, sectorSize)
            s = fat[s]
        }
        return out.toByteArray()
    }

    private fun miniChain(start: Int, size: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        var s = start
        var guard = 0
        while (s >= 0 && s < miniFat.size && out.size() < size && guard++ < 1_000_000) {
            val off = s * miniSectorSize
            if (off + miniSectorSize > miniStream.size) break
            out.write(miniStream, off, miniSectorSize)
            s = miniFat[s]
        }
        return out.toByteArray()
    }

    fun stream(name: String): ByteArray? {
        val e = entries.firstOrNull { it.type == 2 && it.name.equals(name, ignoreCase = true) } ?: return null
        val size = e.size.toInt()
        val bytes = if (e.size < miniCutoff) miniChain(e.start, size) else chain(e.start)
        return bytes.copyOf(minOf(size, bytes.size))
    }
}

/** Reads the cells of the first worksheet of an Excel 97-2003 (.xls, BIFF8) workbook. */
object XlsReader {
    private const val BOF = 0x0809
    private const val EOF = 0x000A
    private const val SST = 0x00FC
    private const val CONTINUE = 0x003C
    private const val LABELSST = 0x00FD
    private const val LABEL = 0x0204
    private const val NUMBER = 0x0203
    private const val RK = 0x027E
    private const val MULRK = 0x00BD
    private const val FORMULA = 0x0006
    private const val STRING = 0x0207

    private class Rec(val type: Int, val data: ByteArray)

    fun rows(file: CompoundFile): List<List<String>> {
        val book = file.stream("Workbook") ?: file.stream("Book") ?: throw ImportException("ملف Excel تالف أو غير مدعوم")
        val recs = records(book)
        val sst = mutableListOf<String>()
        val cells = java.util.TreeMap<Int, java.util.TreeMap<Int, String>>()
        var i = 0
        var inSheet = false
        var sheetDone = false
        var pendingFormula: Pair<Int, Int>? = null
        fun put(r: Int, c: Int, v: String) {
            if (v.isNotBlank()) cells.getOrPut(r) { java.util.TreeMap() }[c] = v
        }
        while (i < recs.size && !sheetDone) {
            val rec = recs[i]
            val d = ByteBuffer.wrap(rec.data).order(ByteOrder.LITTLE_ENDIAN)
            when (rec.type) {
                BOF -> if (rec.data.size >= 4 && (d.getShort(2).toInt() and 0xFFFF) == 0x0010) inSheet = true
                EOF -> if (inSheet) sheetDone = true
                SST -> {
                    val parts = mutableListOf(rec.data)
                    while (i + 1 < recs.size && recs[i + 1].type == CONTINUE) parts.add(recs[++i].data)
                    sst.addAll(readSst(parts))
                }
            }
            if (inSheet && rec.data.size >= 6) {
                val r = d.getShort(0).toInt() and 0xFFFF
                val c = d.getShort(2).toInt() and 0xFFFF
                when (rec.type) {
                    LABELSST -> if (rec.data.size >= 10) put(r, c, sst.getOrElse(d.getInt(6)) { "" })
                    LABEL -> put(r, c, readLabel(rec.data, 6))
                    NUMBER -> if (rec.data.size >= 14) put(r, c, number(d.getDouble(6)))
                    RK -> if (rec.data.size >= 10) put(r, c, number(rk(d.getInt(6))))
                    MULRK -> {
                        val last = d.getShort(rec.data.size - 2).toInt() and 0xFFFF
                        for (col in c..last) {
                            val off = 4 + (col - c) * 6
                            if (off + 6 > rec.data.size - 2) break
                            put(r, col, number(rk(d.getInt(off + 2))))
                        }
                    }
                    FORMULA -> if (rec.data.size >= 14) {
                        val isString = (d.getShort(12).toInt() and 0xFFFF) == 0xFFFF && rec.data[6].toInt() == 0
                        if (isString) pendingFormula = r to c else if ((d.getShort(12).toInt() and 0xFFFF) != 0xFFFF) {
                            put(r, c, number(d.getDouble(6)))
                        }
                    }
                }
            }
            if (inSheet && rec.type == STRING) {
                pendingFormula?.let { (r, c) -> put(r, c, readLabel(rec.data, 0)) }
                pendingFormula = null
            }
            i++
        }
        return cells.values.map { it.values.toList() }
    }

    private fun records(b: ByteArray): List<Rec> {
        val out = mutableListOf<Rec>()
        var p = 0
        while (p + 4 <= b.size) {
            val type = (b[p].toInt() and 0xFF) or ((b[p + 1].toInt() and 0xFF) shl 8)
            val len = (b[p + 2].toInt() and 0xFF) or ((b[p + 3].toInt() and 0xFF) shl 8)
            if (p + 4 + len > b.size) break
            out.add(Rec(type, b.copyOfRange(p + 4, p + 4 + len)))
            p += 4 + len
        }
        return out
    }

    private fun rk(v: Int): Double {
        val d = if (v and 0x02 != 0) (v shr 2).toDouble()
        else java.lang.Double.longBitsToDouble((v.toLong() and 0xFFFFFFFCL) shl 32)
        return if (v and 0x01 != 0) d / 100 else d
    }

    private fun number(d: Double): String =
        java.math.BigDecimal(d).setScale(6, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()

    /** A BIFF8 unicode string with a 16-bit length, inside a single record. */
    private fun readLabel(b: ByteArray, start: Int): String {
        if (start + 3 > b.size) return ""
        val cch = (b[start].toInt() and 0xFF) or ((b[start + 1].toInt() and 0xFF) shl 8)
        val flags = b[start + 2].toInt()
        var p = start + 3
        if (flags and 0x08 != 0) p += 2
        if (flags and 0x04 != 0) p += 4
        return if (flags and 0x01 != 0) String(b, p, minOf(cch * 2, b.size - p), Charsets.UTF_16LE)
        else String(b, p, minOf(cch, b.size - p), Charset.forName("ISO-8859-1"))
    }

    /** The shared string table, whose strings may continue across CONTINUE records. */
    private fun readSst(parts: List<ByteArray>): List<String> {
        val out = mutableListOf<String>()
        var seg = 0
        var pos = 8
        fun avail() = parts[seg].size - pos
        fun nextSeg(): Boolean {
            if (seg + 1 >= parts.size) return false
            seg++
            pos = 0
            return true
        }
        fun byte(): Int {
            while (avail() <= 0) if (!nextSeg()) throw IndexOutOfBoundsException()
            return parts[seg][pos++].toInt() and 0xFF
        }
        fun u16() = byte() or (byte() shl 8)
        fun i32() = u16() or (u16() shl 16)
        fun skip(n: Int) {
            var left = n
            while (left > 0) {
                if (avail() <= 0 && !nextSeg()) return
                val k = minOf(left, avail())
                pos += k
                left -= k
            }
        }
        val total = ByteBuffer.wrap(parts[0]).order(ByteOrder.LITTLE_ENDIAN).getInt(4)
        try {
            repeat(total) {
                if (avail() <= 0 && !nextSeg()) return out
                val cch = u16()
                var flags = byte()
                val runs = if (flags and 0x08 != 0) u16() else 0
                val ext = if (flags and 0x04 != 0) i32() else 0
                val sb = StringBuilder(cch)
                var left = cch
                while (left > 0) {
                    if (avail() <= 0) {
                        if (!nextSeg()) break
                        flags = byte() // a continued string restates whether its characters are 8 or 16 bit
                    }
                    if (flags and 0x01 != 0) {
                        val n = minOf(left, avail() / 2)
                        if (n == 0) { pos = parts[seg].size; continue }
                        sb.append(String(parts[seg], pos, n * 2, Charsets.UTF_16LE))
                        pos += n * 2
                        left -= n
                    } else {
                        val n = minOf(left, avail())
                        sb.append(String(parts[seg], pos, n, Charset.forName("ISO-8859-1")))
                        pos += n
                        left -= n
                    }
                }
                skip(runs * 4 + ext)
                out.add(sb.toString())
            }
        } catch (e: IndexOutOfBoundsException) {
            // Truncated table: keep what was read.
        }
        return out
    }
}

/** Extracts the text of a Word 97-2003 (.doc) document, keeping paragraphs and table cells apart. */
object DocReader {
    fun rows(file: CompoundFile): List<List<String>> {
        val word = file.stream("WordDocument") ?: throw ImportException("ملف Word تالف أو غير مدعوم")
        val fib = ByteBuffer.wrap(word).order(ByteOrder.LITTLE_ENDIAN)
        val flags = fib.getShort(0x0A).toInt()
        if (flags and 0x0100 != 0) throw ImportException("ملف Word محمي بكلمة سر")
        val table = file.stream(if (flags and 0x0200 != 0) "1Table" else "0Table") ?: throw ImportException("ملف Word تالف")
        val fcClx = fib.getInt(0x01A2)
        val lcbClx = fib.getInt(0x01A6)
        if (fcClx < 0 || lcbClx <= 0 || fcClx + lcbClx > table.size) throw ImportException("ملف Word تالف")
        val clx = ByteBuffer.wrap(table, fcClx, lcbClx).order(ByteOrder.LITTLE_ENDIAN)
        var p = fcClx
        while (p < fcClx + lcbClx && table[p].toInt() == 0x01) {
            val cb = (table[p + 1].toInt() and 0xFF) or ((table[p + 2].toInt() and 0xFF) shl 8)
            p += 3 + cb
        }
        if (table[p].toInt() != 0x02) throw ImportException("ملف Word تالف")
        val lcb = clx.getInt(p + 1)
        val plc = p + 5
        val n = (lcb - 4) / 12
        val text = StringBuilder()
        for (i in 0 until n) {
            val cpStart = clx.getInt(plc + i * 4)
            val cpEnd = clx.getInt(plc + (i + 1) * 4)
            val pcd = plc + (n + 1) * 4 + i * 8
            val fcRaw = clx.getInt(pcd + 2)
            val count = cpEnd - cpStart
            if (count <= 0) continue
            if (fcRaw and 0x40000000 != 0) {
                val fc = (fcRaw and 0x3FFFFFFF) / 2
                if (fc + count <= word.size) text.append(String(word, fc, count, Charset.forName("windows-1252")))
            } else if (fcRaw + count * 2 <= word.size) {
                text.append(String(word, fcRaw, count * 2, Charsets.UTF_16LE))
            }
        }
        return toRows(text.toString())
    }

    private fun toRows(s: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        // Remove field codes such as HYPERLINK, keeping the displayed result.
        val clean = s.replace(Regex("\u0013[^\u0014\u0015]*\u0014?"), "").replace("\u0015", "")
        for (para in clean.split('\r', '\u000B', '\u000C')) {
            if ('\u0007' !in para) {
                rows.add(para.split('\t'))
                continue
            }
            // Cells end with \u0007 and each row ends with one more \u0007, without a paragraph break,
            // so rows are cut using the column count of the first row. Text after the table is a paragraph.
            val tokens = para.split('\u0007')
            val cells = tokens.dropLast(1).map { it.trim() }
            val cols = cells.indexOfFirst { it.isEmpty() }
            if (cols <= 0) {
                cells.filter { it.isNotEmpty() }.forEach { rows.add(listOf(it)) }
            } else {
                cells.chunked(cols + 1).forEach { rows.add(it.take(cols)) }
            }
            rows.add(tokens.last().split('\t'))
        }
        return rows
    }
}
