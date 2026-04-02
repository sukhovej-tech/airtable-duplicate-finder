let table = base.getTable("Співробітники");

// Функція для нормалізації телефонних номерів
function normalizePhone(phone) {
    if (!phone) return null;
    
    // Якщо це масив (для поля типу телефон), беремо перший елемент
    if (Array.isArray(phone)) {
        phone = phone[0];
    }
    
    // Конвертуємо в рядок
    let phoneStr = String(phone);
    
    // Видаляємо всі нецифрові символи
    let digits = phoneStr.replace(/\D/g, '');
    
    // Для українських номерів беремо останні 10 цифр (без коду країни +380)
    if (digits.length >= 10) {
        return digits.slice(-10);
    }
    
    return digits;
}

// Функція для нормалізації імені
function normalizeName(name) {
    if (!name) return null;
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')         // прибираємо зайві пробіли
        .replace(/[''ʼ`]/g, "'");      // нормалізуємо апострофи
}

// Функція для нормалізації email
function normalizeEmail(email) {
    if (!email) return null;
    
    // Якщо це масив, беремо перший елемент
    if (Array.isArray(email)) {
        email = email[0];
    }
    
    // Приводимо до нижнього регістру та видаляємо пробіли
    return String(email).toLowerCase().trim();
}

// Зчитуємо всі записи
let query = await table.selectRecordsAsync({
    fields: ["Співробітник", "Пошта 1", "Телефон 1", "Телефон 2", "Telegram", "ID"]
});

let allRecords = query.records;
let updates = [];

console.log(`Перевіряємо ${allRecords.length} записів...`);

// Проходимо по всіх записах
for (let i = 0; i < allRecords.length; i++) {
    let currentRecord = allRecords[i];
    let duplicates = [];
    
    // Отримуємо значення поточного запису
    let values = {
        email1: normalizeEmail(currentRecord.getCellValue("Пошта 1")),
        phone1: normalizePhone(currentRecord.getCellValue("Телефон 1")),
        phone2: normalizePhone(currentRecord.getCellValue("Телефон 2")),
        telegram: currentRecord.getCellValue("Telegram"),
        name: normalizeName(currentRecord.getCellValue("Співробітник")),
        nameRaw: currentRecord.getCellValue("Співробітник")
    };
    
    // Шукаємо дублі серед інших записів
    for (let j = 0; j < allRecords.length; j++) {
        if (i === j) continue; // Пропускаємо поточний запис
        
        let otherRecord = allRecords[j];
        let matchedField = null;
        
        // Отримуємо та нормалізуємо значення з іншого запису
        let rEmail1 = normalizeEmail(otherRecord.getCellValue("Пошта 1"));
        let rPhone1 = normalizePhone(otherRecord.getCellValue("Телефон 1"));
        let rPhone2 = normalizePhone(otherRecord.getCellValue("Телефон 2"));
        let rTelegram = otherRecord.getCellValue("Telegram");
        let rName = normalizeName(otherRecord.getCellValue("Співробітник"));

        // Збираємо всі збіги (незалежно один від одного)
        let matchedFields = [];

        if (values.email1 && rEmail1 && rEmail1 === values.email1) {
            matchedFields.push("Пошта 1");
        }
        if (values.phone1 && rPhone1 && rPhone1 === values.phone1) {
            matchedFields.push("Телефон 1");
        }
        if (values.phone1 && rPhone2 && rPhone2 === values.phone1) {
            matchedFields.push("Телефон 1");
        }
        if (values.phone2 && rPhone1 && rPhone1 === values.phone2) {
            matchedFields.push("Телефон 2");
        }
        if (values.phone2 && rPhone2 && rPhone2 === values.phone2) {
            matchedFields.push("Телефон 2");
        }
        if (values.telegram && rTelegram && rTelegram === values.telegram) {
            matchedFields.push("Telegram");
        }
        if (values.name && rName && rName === values.name) {
            matchedFields.push("Імʼя");
        }

        if (matchedFields.length > 0) {
            matchedField = matchedFields.join(", ");
        }

        if (matchedField) {
            let nameDisplay = otherRecord.getCellValue("Співробітник") || "Без імені";
            let idNumber = otherRecord.getCellValue("ID");
            let messageParts = [];

            if (matchedField.includes("Пошта 1")) messageParts.push(`Email: ${values.email1}`);
            if (matchedField.includes("Телефон 1")) messageParts.push(`Тел1: ${values.phone1}`);
            if (matchedField.includes("Телефон 2")) messageParts.push(`Тел2: ${values.phone2}`);
            if (matchedField.includes("Telegram")) messageParts.push(`Telegram: ${values.telegram}`);
            if (matchedField.includes("Імʼя")) messageParts.push(`Ім'я: ${values.nameRaw}`);

            let message = messageParts.join(", ");
            
            if (idNumber) {
                duplicates.push(`ID ${idNumber}: ${nameDisplay} — ${message} (${matchedField})`);
            } else {
                let shortId = otherRecord.id.substring(0, 6);
                duplicates.push(`ID:${shortId}: ${nameDisplay} — ${message} (${matchedField})`);
            }
        }
    }
    
    // Додаємо в список для оновлення — або попередження, або очищення поля
    if (duplicates.length > 0) {
        updates.push({
            id: currentRecord.id,
            fields: {
                "DUPLICATE ALERT": "🚨 ДУБЛЬ З:\n" + duplicates.join("\n")
            }
        });
    } else {
        updates.push({
            id: currentRecord.id,
            fields: {
                "DUPLICATE ALERT": null
            }
        });
    }
    
    // Логування прогресу
    if ((i + 1) % 10 === 0 || i === allRecords.length - 1) {
        console.log(`Оброблено ${i + 1} з ${allRecords.length} записів`);
    }
}

console.log(`Оновлюємо ${updates.length} записів...`);

// Оновлюємо записи партіями по 50 (обмеження Airtable)
let batchSize = 50;
for (let i = 0; i < updates.length; i += batchSize) {
    let batch = updates.slice(i, i + batchSize);
    await table.updateRecordsAsync(batch);
    console.log(`Оновлено ${Math.min(i + batchSize, updates.length)} з ${updates.length} записів`);
}

let duplicatesFound = updates.filter(u => u.fields["DUPLICATE ALERT"] !== null).length;
if (duplicatesFound > 0) {
    console.log(`✅ Готово! Знайдено дублів: ${duplicatesFound}. Поле оновлено для всіх записів.`);
} else {
    console.log("✅ Готово! Дублів не знайдено. Всі попередження очищено.");
}