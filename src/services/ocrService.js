const { inspectVehiclePlate } = require("./vehiclePlateService");

const extractText = async (filePath, originalName = "") => {
    const result = await inspectVehiclePlate(filePath, originalName);
    return {
        text: result.rawExtractedText,
        plate: result.cleanedPlateNumber,
        isValid: result.isValidFormat
    };
};

module.exports = extractText;