// Simple test script for receipt service
import receiptService from './services/receiptService.js';

async function testReceiptService() {
  console.log('Testing Receipt Service...');

  try {
    // Test with mock data (since we don't have real images)
    const mockImageBuffer = Buffer.from('mock image data');

    console.log('1. Testing extractText with mock data...');
    const extractedText = await receiptService.extractText(mockImageBuffer);
    console.log('Extracted text:', extractedText);

    console.log('2. Testing parseReceiptText...');
    const parsedData = receiptService.parseReceiptText(extractedText);
    console.log('Parsed data:', parsedData);

    console.log('3. Testing validateImage...');
    const isValid = receiptService.validateImage(mockImageBuffer);
    console.log('Image validation result:', isValid);

    console.log('4. Testing processReceipt (full flow)...');
    const result = await receiptService.processReceipt(mockImageBuffer, 'test-user-id');
    console.log('Process receipt result:', result);

    console.log('✅ Receipt Service tests completed successfully!');

  } catch (error) {
    console.error('❌ Receipt Service test failed:', error);
  }
}

testReceiptService();
